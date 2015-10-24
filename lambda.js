require('dotenv').load();
var jwt = require('jwt-simple');
var moment = require('moment');

var CognitoHelper = require('./cognito-helper');
var cognito = new CognitoHelper();

var config = require('./server-config');
console.log('lambda loaded config', config);

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
  console.log('createJWT exp', exp.format());

  var payload = {
      sub: userId,
      iat: moment().unix(),
      exp: exp.unix(),
  };
  console.log('createJWT payload', payload);

  return jwt.encode(payload, config.TOKEN_SECRET);
}

/*
|--------------------------------------------------------------------------
| Verify JWT token for authenticated requests
|--------------------------------------------------------------------------
*/
function checkJWT(authorization, dontFail) {
  if (!authorization) {
    if(dontFail) {
      return null;
    }
    else {
      return {code: 401, message: 'Missing Authorization header'};
    }
  }
  var token = authorization.split(' ')[1];
  var payload = jwt.decode(token, config.TOKEN_SECRET);
  console.log('checkJWT', payload);
  var now = moment().unix();
  console.log('checkJWT', 'exp=' + payload.exp + ' now=' + now);
  if (payload.exp <= now - 60) {
    if(dontFail) {
      return null;
    }
    else {
      return {code: 401, message: 'Token has expired'};
    }
  }
  return payload.sub;
}

/*
|--------------------------------------------------------------------------
| AWS invokes this method to process requests
|--------------------------------------------------------------------------
*/
exports.handler  = function(event, context) {
  console.log('event', event);

  // /auth/{operation}
  var operation = event.operation;
  var payload = event.payload;
  
  var ensureAuthenticated = function(callback) {
    var authorization = event.authorization;
    delete event.authorization;
    
    var t = checkJWT(authorization);
    if(t.message) {
      context.fail(new Error('Unauthorized: ' + t.message));
    }
    else {
      callback(t);
    }
  };
  
  var dataCallback = function(err, data) {
    if(err) {
      context.fail(makeError(err));
    }
    else {
      context.succeed(data);
    }
  };
  
  var makeError = function(err) {
    var errorCode = 'Bad Request';
    switch(err.code) {
    case 404: errorCode = 'Not Found'; break;
    case 409: errorCode = 'Conflict'; break;
    case 401: errorCode = 'Unauthorized'; break;
    }
    return new Error(errorCode + ': ' + (err.error || err));
  };
  
  var tokenCallback = function(err, data) {
//    console.log('tokenCallback err', err);
//    console.log('tokenCallback data', data);
    if(err) {
      context.fail(makeError(err));
    }
    else {
      context.succeed({token: createJWT(data.id)});
    }
  };
  
  if(operation === 'login') {
    cognito.login(payload.email, payload.password, payload.reset, 
        tokenCallback);
  }
  else if(operation === 'signup') {
    cognito.signup(payload.name, payload.email, payload.password, 
        tokenCallback);
  }
  else if(operation === 'me') {
    ensureAuthenticated(function(userId) {
      cognito.getProfile(userId, dataCallback);
    });
  }
  else if(operation === 'credentials') {
    ensureAuthenticated(function(userId) {
      cognito.getCredentials(userId, dataCallback);
    });
  }
  else if(operation === 'forgot') {
    cognito.forgotPassword(payload.email, dataCallback);
  }
  else if(operation === 'update') {
    ensureAuthenticated(function(userId) {
      cognito.updatePassword(userId, payload.password, dataCallback);
    });
  }
  else if(operation === 'unlink') {
    ensureAuthenticated(function(userId) {
      cognito.unlink(userId, payload.provider, null, dataCallback);
    });
  }
  else {
    var provider = operation;
    var userId = checkJWT(event.authorization, true);
    console.log('provider', provider);
    console.log('userId', userId);
    cognito.loginFederated(provider, 
        payload.code, payload.clientId, payload.redirectUri, userId, 
        tokenCallback);
  }
};
