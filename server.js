require('dotenv').load();
var path = require('path');
var bodyParser = require('body-parser');
var express = require('express');
var log4js = require('log4js');
var logger = log4js.getLogger('server');
var jwt = require('jwt-simple');
var moment = require('moment');

var CognitoHelper = require('./cognito-helper');
var cognito = new CognitoHelper();

var config = require('./server-config');
logger.debug('server loaded config', config);

var app = express();

app.set('port', config.PORT);
app.use(log4js.connectLogger(log4js.getLogger('express'), { 
  level: log4js.levels.INFO, 
  format: ':method :url :status :res[content-length] - :response-time ms' 
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'client'), {index: 'app.html'}));

//Add headers
app.use(function (req, res, next) {
  // Websites you wish to allow to connect
  var origin = req.headers['origin'];
  if(origin === 'http://localhost:8100' ||
      origin === 'http://localhost:8103') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 
  'X-Requested-With,content-type,Authorization');
  // disable cache
  res.setHeader('Cache-Control', 'no-cache');
  next();
});

/*
 |--------------------------------------------------------------------------
 | Login Required Middleware
 |--------------------------------------------------------------------------
 */
function ensureAuthenticated(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).send(
        {message: 'Please make sure your request has an Authorization header'});
  }
  var token = req.headers.authorization.split(' ')[1];
  var payload = jwt.decode(token, config.TOKEN_SECRET);
  logger.debug('ensureAuthenticated', payload);
  var now = moment().unix();
  logger.debug(payload.exp + ' ' + now);
  if (payload.exp <= now - 60) {
    return res.status(401).send({ message: 'Token has expired' });
  }
  req.userId = payload.sub;
  next();
}

/*
 |--------------------------------------------------------------------------
 | Generate JSON Web Token
 |--------------------------------------------------------------------------
 */
function createJWT(userId, expiresIn) {
  var exp;
  if(config.EXPIRES_IN) {
    exp = moment().add(config.EXPIRES_IN, 'seconds');
  }
  else if(expiresIn) {
    exp = moment().add(expiresIn, 'seconds');
  }
  else {
    exp = moment().add(14, 'days');
  }
  logger.debug('createJWT exp', exp.format());
  
  var payload = {
    sub: userId,
    iat: moment().unix(),
    exp: exp.unix(),
  };
  logger.debug('createJWT payload', payload);
  
  return jwt.encode(payload, config.TOKEN_SECRET);
}

/*
 |--------------------------------------------------------------------------
 | Get Profile
 |--------------------------------------------------------------------------
 */
app.post('/auth/me', ensureAuthenticated, function(req, res) {
  cognito.getProfile(req.userId, function(err, user) {
    if(err) {
      return res.status(err.statusCode || err.code || 400).send(err);
    }
    res.send(user);
  });
});

/*
 |--------------------------------------------------------------------------
 | Get AWS Credentials
 |--------------------------------------------------------------------------
 */
app.post('/auth/credentials', ensureAuthenticated, function(req, res) {
  cognito.getCredentials(req.userId, function(err, credentials) {
    if(err) {
      return res.status(err.statusCode || err.code || 400).send(err);
    }
    res.send(credentials);
  });
});

/*
 |--------------------------------------------------------------------------
 | Update Password
 |--------------------------------------------------------------------------
 */
app.post('/auth/update', ensureAuthenticated, function(req, res) {
  cognito.updatePassword(req.userId, req.body.password, function(err, data) {
    if(err) {
      return res.status(err.statusCode || err.code || 400).send(err);
    }
    else {
      res.status(200).end();
    }
  });
});

/*
 |--------------------------------------------------------------------------
 | Forgot Password
 |--------------------------------------------------------------------------
 */
app.post('/auth/forgot', function(req, res) {
  cognito.forgotPassword(req.body.email, function(err, data) {
    if(err) {
      return res.status(err.statusCode || err.code || 400).send(err);
    }
    else {
      res.status(200).end();
    }
  });
});

/*
 |--------------------------------------------------------------------------
 | Log in with Email
 |--------------------------------------------------------------------------
 */
app.post('/auth/login', function(req, res) {
  cognito.login(req.body.email, req.body.password, req.body.reset, 
      function(err, user) {
    if(err) {
      return res.status(err.statusCode || err.code || 400).send(err);
    }

    res.send({ token: createJWT(user.id) });
  });
});

/*
 |--------------------------------------------------------------------------
 | Create Email and Password Account
 |--------------------------------------------------------------------------
 */
app.post('/auth/signup', function(req, res) {
  cognito.signup(req.body.name, req.body.email, req.body.password, 
      function(err, user) {
    if(err) {
      return res.status(err.statusCode || err.code || 400).send(err);
    }

    res.send({ token: createJWT(user.id) });
  });
});

/*
 |--------------------------------------------------------------------------
 | Unlink Provider
 |--------------------------------------------------------------------------
 */
app.post('/auth/unlink', ensureAuthenticated, function(req, res) {
  var provider = req.body.provider;
  
  var userId = req.userId;
  
  cognito.unlink(userId, provider, null, function(err, data) {
    if(err) {
      return res.status(err.statusCode || err.code || 400).send(err);
    }
    else {
      res.status(200).end();
    }
  });
});

/*
 |--------------------------------------------------------------------------
 | Login With Federated Provider
 |--------------------------------------------------------------------------
 */
app.post('/auth/:provider', function(req, res) {
  var loggedIn = false, payload = null;
  if(req.headers.authorization) {
    var jwtToken = req.headers.authorization.split(' ')[1];
    payload = jwt.decode(jwtToken, config.TOKEN_SECRET);
    logger.debug('payload', payload);
    loggedIn = payload.exp > moment().unix();
    logger.debug('loggedIn', loggedIn);
  }
  var userId = loggedIn ? payload.sub : null;
  
  cognito.loginFederated(req.params.provider, req.body.code, 
      req.body.clientId, req.body.redirectUri, userId, function(err, data) {
    if(err) {
      return res.status(err.statusCode || err.code || 400).send(err);
    }

    res.send({ token: createJWT(data.id, data.expiresIn) });
  });
});

/*
 |--------------------------------------------------------------------------
 | Start the Server
 |--------------------------------------------------------------------------
 */
app.listen(app.get('port'), function() {
  logger.info('express server listening on port ' + app.get('port'));
});
