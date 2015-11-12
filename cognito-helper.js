/**
 * @module cognito-helper
 */
require('dotenv').load();
var sha256 = require('js-sha256').sha256;
var _ = require('lodash');
var async = require('async');
var randomstring = require('randomstring');
var format = require('string-format');
format.extend(String.prototype);
var request = require('request');
var logger = require('log4js').getLogger('CognitoHelper');
var AWS = require('./aws');
var configDefault = require('./config');

/**
 * Wrapper for Amazon Cognito library with methods common for a web 
 * or mobile app, like authenticating with email and password, signup, 
 * federated login, link accounts, reset password etc.
 * @class
 * @param {Object} config - default config settings can be loaded from config.js 
 */
function CognitoHelper(config) {
  if(!config) {
    config = configDefault;
    logger.info('cognito-helper loaded default config', config);
  }
  else {
    logger.info('cognito-helper loaded config', config);
  }
  
	var CognitoHelper = this;
	
  var cognitoIdentity = new AWS.CognitoIdentity();
  
  var cognitoSync = new AWS.CognitoSync();
  
  var ses = new AWS.SES();
  
  var encryptPassword = function(password) {
    return sha256(password);
  };
  
  var getRefreshTokenKey = function(provider) {
    return  'refresh' + provider;
  };
  
  var getProfileKey = function(provider) {
    return  'profile' + provider;
  };

	var normalizeProvider = function(providerName, token) {
	  var isDeveloper = false;
	  var cognitoProviderName = providerName;
	  var prefixedToken = token;
	  if(providerName === 'google') {
	    cognitoProviderName = 'accounts.google.com';
	  }
	  else if(providerName === 'facebook') {
	    cognitoProviderName = 'graph.facebook.com';
	  }
	  else if(providerName === 'amazon') {
	    cognitoProviderName = 'www.amazon.com';
	  }
	  else if(providerName === 'twitter') {
	    cognitoProviderName = 'api.twitter.com';
	  }
	  else {
	    cognitoProviderName = config.COGNITO_DEVELOPER_PROVIDER_NAME;
	    isDeveloper = true;
	    if(providerName && token) {
	      prefixedToken = providerName + config.COGNITO_SEPARATOR + token;
	    }
	  }
	  return {
	    name: cognitoProviderName, 
	    isDeveloper: isDeveloper, 
	    token: prefixedToken
	  };
	};
  
	/**
	 * Retrieves records from a CognitoSync profile dataset.
   * @param {String} identityId - CognitoIdentity ID
   * @param {Array} keys - only records whose names start with these keys
   * @param callback - function(err, data)
	 */
  CognitoHelper.getRecords = function(identityId, keys, callback) {
    var params = {
        IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID, 
        IdentityId: identityId,
        DatasetName: config.COGNITO_DATASET_NAME
    };
    logger.debug('listRecords', params);
    
    cognitoSync.listRecords(params, function(err, dataRecords) {
      if(err) {
        callback(err);
      }
      else {
        var ret = {};

        _.each(keys, function(key) {
          var records = _.filter(dataRecords.Records, function(r) { 
            return _.startsWith(r.Key, key); 
          });

          _.each(records, function(record) {
            ret[record.Key] = record.Value;
          });
          
        });
        
        callback(null, ret);
      }
    });
  };
  
  /**
   * Updates record in a user's profile with CognitoSync.
   * @param {String} identityId - CognitoIdentity ID
   * @param {Object} dataCreate - map of the records to create
   * @param {Object} dataReplace - map of the records to replace
   * @param {Object} dataRemove - map of the records to remove
   * @param callback - function(err, data)
   */
  CognitoHelper.updateRecords = function(identityId, 
      dataCreate, dataReplace, dataRemove, 
      callback) {
    var params = {
        IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID, 
        IdentityId: identityId,
        DatasetName:config.COGNITO_DATASET_NAME
    };
    logger.debug('listRecords', params);

    cognitoSync.listRecords(params, function(err, dataRecords) {
      if(err) {
        callback({code: 404, error: err});
      }
      else {
        var recordPatches = [];
        
        for(var key in dataCreate) {
          var record = _.find(dataRecords.Records, function(r) { 
            return r.Key === key;
          });
          if(!record) {
            recordPatches.push({
              Op: 'replace',
              SyncCount: 0,
              Key:key,
              Value:dataCreate[key]
            });
          }
        }
        
        for(var key in dataReplace) {
          var record = _.find(dataRecords.Records, function(r) { 
            return r.Key === key;
          });
          recordPatches.push({
            Op: 'replace',
            SyncCount: (record ? record.SyncCount : 0),
            Key:key,
            Value:dataReplace[key]
          });
        }
        
        for(var key in dataRemove) {
          var record = _.find(dataRecords.Records, function(r) { 
            return r.Key === key;
          });
          if(record) {
            recordPatches.push({
              Op: 'remove',
              SyncCount: record.SyncCount,
              Key:key,
             /* Value:dataRemove[key]*/
            });
          }
        }

        params.SyncSessionToken = dataRecords.SyncSessionToken;
        params.RecordPatches = recordPatches;
        logger.debug('updateRecords', params);

        cognitoSync.updateRecords(params, function(err, data) {
          if(err) {
            logger.debug('updateRecords err', err);
          }
          // ignore err as may get ResourceConflictException 
          // but still have updated successfully
          callback(null, true);
        });
      }
    });
  };
  
  /**
   * Retrieves a refresh token for the federated provider the user last logged 
   * in with. The refresh token is kept in a profile dataset in CognitoSync.
   * Use to call the provider to obtain a new access token.
   * @param {String} identityId - CognitoIdentity ID
   * @param callback - function(err, data)
   */
  CognitoHelper.getRefreshToken = function(identityId, callback) {
    var keys = ['provider','refresh'];
    CognitoHelper.getRecords(identityId, keys, function(err, data) {
      if(err) {
        callback(err);
      }
      else {
        callback(null, {
          provider: data.provider,
          refreshToken: data[getRefreshTokenKey(data.provider)]
        });
      }
    });
  };
  
  var updateRefreshToken = function(identityId, provider, refreshToken, profile,
      callback) {
    var replace = {};
    
    if(refreshToken)
      replace[getRefreshTokenKey(provider)] = refreshToken;
    
    if(profile)
      replace[getProfileKey(provider)] = JSON.stringify(profile);
    
    CognitoHelper.updateRecords(identityId, null, replace, null, callback);
  };
  
  var onLogin = function(provider, token, refreshToken, profile, name, 
      identityId, callback) {
    // updateRecords
    var create = {};
    var replace = {};
    var remove = {};
    
    if(name)
      create.name = name;
    
    if(provider) {
      replace.provider = provider;
      replace.token = token;

      if(refreshToken)
        replace[getRefreshTokenKey(provider)] = refreshToken;

      if(profile)
        replace[getProfileKey(provider)] = JSON.stringify(profile);
    }
    else {
      replace.provider = null;
      replace.token = null;
    }

    CognitoHelper.updateRecords(identityId, create, replace, remove, 
        function(err) {
      if(err) {
        callback(err);
      }
      else {
        callback(null, {id: identityId});
      }
    });
  };
  
  var getCredentialsForIdentity = function(params, callback) {
    logger.debug('getCredentialsForIdentity ', params);
    
    cognitoIdentity.getCredentialsForIdentity(params, 
        function(err, dataCredentials) {
      if(err) {
        logger.warn('getCredentialsForIdentity err', err);
        
        if(err.code === 'NotAuthorizedException') {
        /*if(err.message === 'Invalid login token.') {*/
          // attempted to validate but provider token has expired, 
          // need to use refresh token to get a new one
          logger.debug('needs refresh', err);

          CognitoHelper.refreshProvider(params.IdentityId, 
              function(err, dataRefresh) {
            if(err) {
              logger.error('getCredentialsForIdentity refreshProvider err', err);
              callback(err);
            }
            else {
              logger.debug('getCredentialsForIdentity refreshProvider dataRefresh', dataRefresh);
              
              params.Logins[_.keys(params.Logins)[0]] = dataRefresh.token;
              getCredentialsForIdentity(params, callback);
              //CognitoHelper.getCredentials(params.IdentityId, callback);
            }
          });
        }
        else {
          callback(err);
        }
      }
      else {
        callback(null, dataCredentials);
      }
    }
    );
  };
  
  /**
   * Retrieves AWS Credentials to call AWS services 
   * the Authenticated User Role permits.
   * If the credentials expired due to a time limit on federated login session, 
   * uses saved refresh token to re-login with the federated provider, and 
   * uses the new access token. 
   * @param {String} identityId - CognitoIdentity ID
   * @param callback - function(err, data)
   */
  CognitoHelper.getCredentials = function(identityId, callback) {
    getCurrentProvider(identityId, function(err, dataProvider) {
      if(err) {
        callback(err);
      }
      else if(!dataProvider || !dataProvider.token) {
        callback(null, null);
      }
      else {
        var params = {
            IdentityId: identityId,
            Logins: {}
        };
        
        var p = normalizeProvider(dataProvider.provider, dataProvider.token);
        //logger.debug('provider', p);
        
        params.Logins[p.name] = p.token;
        
        if(p.isDeveloper) {          
          params.IdentityPoolId = config.COGNITO_IDENTITY_POOL_ID;
          logger.debug('getOpenIdTokenForDeveloperIdentity', params);
          
          cognitoIdentity.getOpenIdTokenForDeveloperIdentity(params, 
              function(err, dataOpenIdToken) {
            if(err) {
              callback(err);
            }
            else {
              var params = {
                  IdentityId: identityId,
                  Logins: {}
              };
              params.Logins['cognito-identity.amazonaws.com'] = 
                dataOpenIdToken.Token;
              
              getCredentialsForIdentity(params, callback);
            }
          });
        }
        else {          
          getCredentialsForIdentity(params, callback);
        }
      } 
    });
  };
  
  /**
   * Creates a user in CognitoIdentity with an email as a developer identifier.
   * Stores user name and password in CognitoSync.
   * @param {String} name - user's name
   * @param {String} email - email uniquely identifies a user
   * @param {String} password
   * @param callback - function(err, data)
   */
  CognitoHelper.signup = function(name, email, password, callback) {
    CognitoHelper.getId(null, email, function(err, dataId) {
      if(dataId) {
        callback({code: 409, error: 'An account already exists with ' + email});
      }
      else {
        createDeveloperIdentity(email, function(err, dataDeveloperIdentity) {
          if(err) {
            callback(err);
          }
          else {
            putPasswordCognitoSync(dataDeveloperIdentity.IdentityId, password, 
                function(err, data) {
              if(err) {
                callback(err);
              }
              else {
                onLogin(null, email, null, null, name, 
                    dataDeveloperIdentity.IdentityId, callback);
              }
            });
          }
        });
      }
    });
  };
  
  /**
   * Updates password record in a user's profile with CognitoSync.
   * @param {String} identityId - CognitoIdentity ID
   * @param {String} password - new password
   * @param callback - function(err, data)
   */
  CognitoHelper.updatePassword = function(identityId, password, callback) {
    putPasswordCognitoSync(identityId, password, callback);
  };
  
  /**
   * Sends an email with a link to temporarily login the user
   * instead of a forgotten password. Uses Amazon SimpleEmailService (SES). 
   * Email body, subject and source are defined in the config. 
   * Make sure the email source (from email) is authorized to send emails 
   * with SES. 
   * @param {String} email - email uniquely identifies a user
   * @param callback - function(err, data)
   */
  CognitoHelper.forgotPassword = function(email, callback) {
    CognitoHelper.getId(null, email, function(err, dataId) {
      if(err || !dataId) {
        callback({code: 404, error: 'does not exist ' + email});
      }
      else {
        var identityId = dataId.IdentityId;
        var r = randomstring.generate();
        logger.debug('r', r);

        // send email with the link
        var url = 
          config.COGNITO_PASSWORD_RESET_URL.format({email: email, reset: r});
        var body = config.COGNITO_PASSWORD_RESET_BODY.format({name: email});
        var bodyTxt = body.concat('\n\n').concat(url);
        var link = '<a href="{url}">{url}</a>'.format({url: url});
        var bodyHtml = body.concat('<br/><br/>').concat(link);
        
        var params = {
            Destination: { ToAddresses: [email] },
            Message: {
              Body: {
                Html: { Data: bodyHtml },
                Text: { Data: bodyTxt }
              },
              Subject: { Data: config.COGNITO_PASSWORD_RESET_SUBJECT }
            },
            Source: config.COGNITO_PASSWORD_RESET_SOURCE
        };
        logger.debug('params', params);
        
        ses.sendEmail(params, function(err, data) {
          if(err)
            callback('cannot sendEmail ' + err);
          else {
            var p = encryptPassword(r);
            CognitoHelper.updateRecords(identityId, null, {reset:p}, null, 
                function(err, data) {
              if(err) {
                callback(err);
              }
              else {
                callback(null, r);
              }
            });
          }
        });
      }
    });
  };
  
  var putPasswordCognitoSync = function(identityId, password, callback) {
    var p = encryptPassword(password);
    CognitoHelper.updateRecords(identityId, null, {password:p}, null, callback);
  };
  
  var checkPasswordCognitoSync = function(identityId, password, reset, 
      callback) {
    CognitoHelper.getRecords(identityId, ['password','reset'], 
        function(err, data) {
      if(err)
        callback('cannot get password ' + err);
      else {
        if(reset) {
          // verifying with reset
          var p = encryptPassword(reset);
          if(!data.reset)
            callback('reset does not exist');
          else if(p !== data.reset) {
            callback('reset does not match');
          }
          else {
            CognitoHelper.updateRecords(identityId, null, null, {reset:reset}, 
                callback);
          }
        }
        else if(password) {
          // verifying with password
          var p = encryptPassword(password);
          if(!data.password)
            callback('password does not exist');
          else if(p !== data.password)
            callback('password does not match');
          else
            callback(null, true);
        }
        else {
          callback('neither password nor reset');
        }
      }
    });
  };
  
  /**
   * Logs in with the user's email stored as a developer identifier in 
   * CognitoIdentity and either a password or a reset token emailed in a 
   * forgot password email.
   * @param {String} email - email uniquely identifies a user
   * @param {String} password - null if passing reset
   * @param {String} reset - random string emailed by forgotPassword;
   * null if passing password
   * @param callback - function(err, data)
   */
  CognitoHelper.login = function(email, password, reset, callback) {
    CognitoHelper.getId(null, email, function(err, dataId) {
      if(err || !dataId) {
        callback({code: 404, error: 'does not exist ' + email});
      }
      else {
        checkPasswordCognitoSync(dataId.IdentityId, password, reset, 
            function(err, data) {
          if(err) {
            callback({code: 401, error: err});
          }
          else {
            onLogin(null, email, null, null, null, dataId.IdentityId, callback);
          }
        });
      }
    });
  };
  
  var loginFederatedWithToken = function(provider, token, refreshToken, 
      profile, name, email, callback) {
    // retrieve an existing or create a new account
    CognitoHelper.getId(provider, token, function(err, dataId) {
      if(err) {
        callback(err);
      }
      else {
        // check if existing account already has an email as its developer id
        getEmail(dataId.IdentityId, function(existingEmail) {
          logger.debug('email ' + email + ' existingEmail ' + existingEmail);
          if(email && !existingEmail) {
            // if no existing email but passed an email, create a developer
            // identity with that new email and...
            CognitoHelper.getId(null, email, 
                function(err, existingEmaildataId) {
              logger.debug('exists dataId for ' + email, existingEmaildataId);
              
              if(err || !existingEmaildataId) {
                // ... link the new dev identity (identitied by email)
                // with the one being created (identified by provider and token) 
                // thus adding email as its dev identifier
                linkWithToken(provider, token, null, email, 
                    function(err, data) {
                  if(err) {
                    callback(err);
                  }
                  else
                    onLogin(provider, token, refreshToken, profile, name, 
                        dataId.IdentityId, callback);
                });
              }
              else {
                // fail if already have an account identified with the new email
                // that came with the profile, otherwise an existing account
                // will be linked to the new one, and its original identity
                // disabled and its profile lost
                callback({code: 409, 
                  error: 'There is already an account with '
                    + email + ' that belongs to you'});
              }
            });
          }
          else {
            onLogin(provider, token, refreshToken, profile, name, 
                dataId.IdentityId, callback);
          }
        });
      }
    });
  };
  
  /**
   * Retrieves from CognitoIdenity a list of federated providers which the user 
   * has logins with. Use to display a list of linked logins in a
   * user's profile.
   * @param {String} identityId - CognitoIdentity ID
   * @param finalCallback - function(err, data)
   */
  CognitoHelper.describe = function(identityId, finalCallback) {
    async.parallel({
      describeIdentity: function(callback) {
        var params = {IdentityId:identityId};
        logger.debug('describeIdentity', params);
        
        cognitoIdentity.describeIdentity(params, function(err, data) {
          if(err) {
            callback(err);
          }
          else {
            var u = {};
            u.id = data.IdentityId;
            
            _.each(data.Logins, function(p) {
              if(p === 'accounts.google.com')
                u.google = true;
              else if(p === 'graph.facebook.com')
                u.facebook = true;
              else if(p === 'www.amazon.com')
                u.amazon = true;
              else if(p === 'api.twitter.com')
                u.twitter = true;
            });
            
            callback(null, u);
          }
        });
      },
      getDeveloperTokens: function(callback) {
        CognitoHelper.getDeveloperTokens(identityId, function(developerTokens) {
          var u = {};
          
          _.each(developerTokens, function(t) {
            var d = t.substring(0, t.indexOf(config.COGNITO_SEPARATOR));
            if(d)
              u[d] = true;
            else
              u.email = t;
          });
          
          callback(null, u);
        });
      }
    }
    , function(err, results) {
      if(err)
        finalCallback(err);
      else
        finalCallback(null, 
            _.merge(results.describeIdentity, results.getDeveloperTokens));
    });
  };
  
  /**
   * Retrieves from CognitoIdenity a list of federated providers which a user 
   * has logins with. 
   * Retrieves user name, email, profile from CognitoSync.
   * Use to display full user profile.
   * @param {String} identityId - CognitoIdentity ID
   * @param finalCallback - function(err, data)
   */
  CognitoHelper.getProfile = function(identityId, finalCallback) {
    async.parallel({
      describe: function(callback) {
        CognitoHelper.describe(identityId, callback);
      },
      getRecords: function(callback) {
        CognitoHelper.getRecords(identityId, 
            ['name','provider','profile','password'], 
            function(err, data) {
          if(err) {
            callback(err);
          }
          else {
            var user = {};
            
            user.name = data.name;
            user.provider = data.provider;
            
            for(var a in data) {
              if(_.startsWith(a, 'profile'))
                user[a] = data[a];
            }
            
            user.password = data.password ? true : false;
            
            callback(null, user);
          }
        });
      }
    },
    function(err, results) {
      if(err) {
        finalCallback(err);
      }
      else {
        var user = _.merge(results.describe, results.getRecords);
        
        user.name = user.name || user.email || user.id;

        // for compatibility with satellizer
        user.displayName = user.name;
        
        finalCallback(null, user);
      }
    });
  };
  
  var createDeveloperIdentity = function(token, callback) {
    var p = normalizeProvider(null, token);
    
    var logins = {};
    logins[p.name] = p.token;
    
    var params = {
        IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID,  
        Logins : logins,
        //TokenDuration: 60
    };
    logger.debug('getOpenIdTokenForDeveloperIdentity', params);
    
    cognitoIdentity.getOpenIdTokenForDeveloperIdentity(params, callback);
  };
  
  /**
   * Retrieves CognitoIdenity ID given either a federated provider token 
   * or user email.
   * @param {String} provider - name of a federated login provider like google, 
   * amazon, facebook, twitter, stripe, paypal; or null for email as token
   * @param {String} token - access token gotten from provider thru oauth 
   * or user's email
   * @param callback - function(err, data)
   */
  CognitoHelper.getId = function(provider, token, callback) {
    var p = normalizeProvider(provider, token);
    
    if(p.isDeveloper) {
      var params = {
          IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID,
          DeveloperUserIdentifier: p.token, 
          MaxResults:10
      };
      logger.debug('lookupDeveloperIdentity', params);
      
      cognitoIdentity.lookupDeveloperIdentity(params, callback);
    }
    else {
      var logins = {};
      logins[p.name] = p.token;
      
      var params = {
          IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID, 
          AccountId: config.AWS_ACCOUNT_ID, 
          Logins:logins
      };
      logger.debug('getId', params);
      
      cognitoIdentity.getId(params, callback);
    }
	};
  
	/**
   * Retrieves all developer (non federated) identifiers like user emails or
   * ids with federated providers not integrated with AWS like PayPal or Stripe.
   * @param {String} identityId - CognitoIdentity ID
   * @param callback - function(err, data)
   */
  CognitoHelper.getDeveloperTokens = function(identityId, callback) {
    var params = {
        IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID,
        IdentityId: identityId,
        MaxResults: 10};
    logger.debug('lookupDeveloperIdentity', params);
    
    cognitoIdentity.lookupDeveloperIdentity(params, function(err, data) {
      if(err) {
        callback([]);
      }
      else {
        callback(data.DeveloperUserIdentifierList);
      }
    });
  };
  
  var existsEmail = function(email, userId, callback) {
    CognitoHelper.getId(null, email, function(err, dataId) {
      logger.debug('existsEmail dataId for ' + email + ' ' + userId, dataId);
      
      if(err || !dataId) {
        logger.debug('existsEmail dataId not found');
        callback(null, false);
      }
      else if(userId === dataId.IdentityId) {
        logger.debug('existsEmail same user');
        callback(null, false);
      }
      else {
        callback(null, true);
      }
    });
  }
  
  var existsFederated = function(provider, token, callback) {
    CognitoHelper.getId(provider, token, function(err, dataId) {
      logger.debug('existsFederated dataId for ' + provider, dataId);
      
      if(err || !dataId) {
        callback(null, false);
      }
      else {
        CognitoHelper.getRecords(dataId.IdentityId, ['token'], 
            function(err, data) {
          logger.debug('data', data);
          logger.debug('Object.keys(data)', Object.keys(data));
          
          if(err) {
            callback(err);
          }
          else { 
            callback(null, Object.keys(data).length === 1);
          }
        });
      }
    });
  }
  
  var linkDeveloperAndDeveloper = function(currentToken, linkToken, callback) {
    logger.debug('currentToken ' + currentToken + ' linkToken ' + linkToken);
    
    createDeveloperIdentity(linkToken, function(err, data) {
      if(err) {
        callback(err);
      }
      else {
        var params = {
            IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID,
            DeveloperProviderName: config.COGNITO_DEVELOPER_PROVIDER_NAME,
            DestinationUserIdentifier: linkToken,
            SourceUserIdentifier: currentToken
        };
        logger.debug('mergeDeveloperIdentities', params);

        cognitoIdentity.mergeDeveloperIdentities(params, callback);
      }
    });
  };
  
  var linkDeveloperAndFederated = function(identityId, 
      currentProvider, currentToken,
      developerToken, 
      callback) {
    var logins = {};
    logins[currentProvider] = currentToken;
    logins[config.COGNITO_DEVELOPER_PROVIDER_NAME] = developerToken;
    
    var params = {
        IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID,
        IdentityId: identityId, 
        Logins: logins
    };
    logger.debug('getOpenIdTokenForDeveloperIdentity', params);
    
    cognitoIdentity.getOpenIdTokenForDeveloperIdentity(params, callback);
  };
	
  var linkWithToken = function(currentProvider, currentToken,
      linkProvider, linkToken,  
      callback) {
    var current = normalizeProvider(currentProvider, currentToken);
    var link = normalizeProvider(linkProvider, linkToken);
    
    CognitoHelper.getId(currentProvider, currentToken, function(err, data) {
      if(err) {
        callback(err);
      }
      else {
        var identityId = data.IdentityId;
        
        logger.debug('current identityId', identityId);
        
        if(current.isDeveloper && link.isDeveloper) {
          // link both developers 
          logger.debug('link both developers');
          
          linkDeveloperAndDeveloper(current.token, link.token, callback);
        }
        else if(!current.isDeveloper && !link.isDeveloper) {
          // link both federated
          logger.debug('link both federated');
          
          var logins = {};
          logins[current.name] = current.token;
          logins[link.name] = link.token;
          
          var params = {
              IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID,
              IdentityId: identityId, 
              Logins: logins
          };
          logger.debug(params);
          
          cognitoIdentity.getOpenIdTokenForDeveloperIdentity(params, 
              callback);
        }
        else if(!current.isDeveloper && link.isDeveloper) {
          // link developer to federated
          logger.debug('link developer to federated');

          // check if federated has developer ids linked already
          CognitoHelper.getDeveloperTokens(identityId, 
              function(developerTokens) {
            if(developerTokens.length > 0) {
              // link developer to one of the developer tokens of this identity
              var currentDeveloperToken = developerTokens[0];

              logger.debug('link developer to identity that has fed and dev', 
                  currentDeveloperToken);

              linkDeveloperAndDeveloper(currentDeveloperToken, 
                  link.token, callback);
            }
            else {
              // link developer to identity that has federated only
              logger.debug('link developer to identity that has fed only');

              linkDeveloperAndFederated(identityId, 
                  current.name, current.token,
                  link.token, callback);
            }
          });
        }
        else {
          // link federated to developer
          logger.debug('link federated to developer');
          
          linkDeveloperAndFederated(identityId, 
              link.name, link.token,
              current.token, callback);
        }
      }
    });
	};
	
	var unlinkWithToken = function(currentProvider, currentToken,
      linkProvider, linkToken, 
      callback) {
    var current = normalizeProvider(currentProvider, currentToken);
    var link = normalizeProvider(linkProvider, linkToken);
    
    CognitoHelper.getId(currentProvider, currentToken, function(err, data) {
      if(err) {
        callback(err);
      }
      else {
        var identityId = data.IdentityId;
        
        logger.debug('current identityId', identityId);
        
        if(link.isDeveloper) {
          // unlink developer
          logger.debug('unlink developer');
          
          CognitoHelper.getDeveloperTokens(identityId, 
              function(developerTokens) {
            var developerProvider = linkProvider || '';
            
            var developerToken = _.find(developerTokens, function(t) {
              return developerProvider === 
                t.substring(0, t.indexOf(config.COGNITO_SEPARATOR));
            });
            
            var params = {
                IdentityId: identityId,
                IdentityPoolId: config.COGNITO_IDENTITY_POOL_ID,
                DeveloperProviderName: config.COGNITO_DEVELOPER_PROVIDER_NAME,
                DeveloperUserIdentifier: link.token || developerToken
            };
            
            cognitoIdentity.unlinkDeveloperIdentity(params, callback);
          });
        }
        else {
          // unlink federated
          
          var logins = {};
          
          if(current.isDeveloper) {
            logger.debug('unlink federated from developer');
            
            logins[link.name] = link.token;
          }
          else {
            logger.debug('unlink federated from federated');
            
            logins[current.name] = current.token;            
          }
          
          var params = {IdentityId:identityId, Logins:logins, 
              LoginsToRemove: [link.name]};
          logger.debug('unlinkIdentity', params);
          
          cognitoIdentity.unlinkIdentity(params, callback);
        }
      }
    });
	};
	
	var getEmail = function(identityId, callback) {
	  CognitoHelper.getDeveloperTokens(identityId, function(developerTokens) {
	    var email = _.find(developerTokens, function(t) {
	      return t.indexOf(config.COGNITO_SEPARATOR) === -1;
	    });

	    callback(email);
	  });
	};
	
	var getCurrentProvider = function(identityId, callback) {
	  CognitoHelper.getRecords(identityId, ['provider','token'], 
        function(err, current) {
      if(err) {
        callback(err);
      }
      else if(!current.provider) {
        getEmail(identityId, function(email) {
          callback(null, {provider: null,token: email});
        });
      }
      else {
        callback(null, current);
      }
    });
	};
  
	/**
   * Establishes a link to a login with federated provider. 
   * @param {String} identityId - CognitoIdentity ID
   * @param {String} linkProvider - name of the federated provider to link
   * @param {String} linkToken - access token from the federated provider
   * @param {String} linkRefreshToken - refresh token 
   * from the federated provider to save
   * @param {String} linkProfile - json formatted user profile 
   * with the federated provider to save
   * @param callback - function(err, data)
   */
  CognitoHelper.link = function(identityId, 
      linkProvider, linkToken, linkRefreshToken, linkProfile, callback) {
    getCurrentProvider(identityId, function(err, current) {
      if(err) {
        callback(err);
      }
      else {
        async.parallel({
          link: function(callback) {
            linkWithToken(current.provider, current.token, 
                linkProvider, linkToken, callback);
          },
          updateRefreshToken: function(callback) {
            updateRefreshToken(identityId, linkProvider, linkRefreshToken, 
                linkProfile, callback);
          }
        }, 
        function(err, results) {
          if(err)
            callback(err);
          else
            callback(null, results.link);
        });
      }
    });
  };
  
  /**
   * Removes a link to a login with federated provider. 
   * @param {String} identityId - CognitoIdentity ID
   * @param {String} linkProvider - name of the federated provider to unlink
   * @param {String} linkToken - access token from the federated provider
   * @param callback - function(err, data)
   */
  CognitoHelper.unlink = function(identityId, 
      linkProvider, linkToken, callback) {
    getCurrentProvider(identityId, function(err, current) {
      if(err) {
        callback(err);
      }
      else {
        unlinkWithToken(current.provider, current.token, 
            linkProvider, linkToken, callback);
      }
    });
  };
  
  /**
   * Logs in with a federated provider. 
   * @param {String} provider - name of the federated provider to login with
   * @param {String} code - access code returned from an oauth call to the 
   * federated provider after a successful authorization
   * @param {String} clientId - oauth client id of your web or mobile app with
   * the federated provider
   * @param {String} redirectUri - redirect url returned from an oauth call to 
   * the provider
   * @param {String} userId - if a user CognitoIdentity ID is given, means the
   * user is already logged in and a subsequent login with the federated 
   * provider will link the provider login with the current login
   * @param callback - function(err, data)
   */
  CognitoHelper.loginFederated = function(provider, code, clientId, 
      redirectUri, userId, callback) {
    var accessTokenUrl = config.providers[provider].accessTokenUrl;
    var peopleApiUrl = config.providers[provider].peopleApiUrl;
    var params = {
      code: code,
      client_id: clientId,
      client_secret: config.providers[provider].client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    };
    logger.debug('params', params);
    
    // Step 1. Exchange authorization code for access token.
    request.post(accessTokenUrl, { json: true, form: params }, 
        function(err, response, token) {
      if(err) {
        callback(err);
      }
      else if(!token.access_token) {
        logger.warn('no token.access_token', token);
        callback({code: 400, 
          error: 'no token ' + token.error + ' ' + token.error_description});
      }
      else {
        logger.debug('token', token);
        
        var accessToken = token.access_token;
        var headers = { Authorization: 'Bearer ' + accessToken };
        var refreshToken = token.refresh_token;
        var expiresIn = token.expires_in;
        
        // Step 2. Retrieve profile information about the current user.
        request.get({ url: peopleApiUrl, headers: headers, json: true }, 
            function(err, response, profile) {
          if(err) {
            callback (err);
          }
          else {
            logger.debug('profile', profile);
            
            var norm = config.providers[provider].normalize(token, profile);
            logger.debug('norm', norm);
            
            var idToken = norm.idToken;
            var name = norm.name;
            var email = norm.email;
            
            if(userId) {
              // Step 3a. Link user accounts if passed userId.
              // check if a federated user already exists
              existsFederated(provider, idToken, 
                  function(err, existsFederated) {
                if(err) {
                  callback(err);
                }
                else if(existsFederated) {
                  callback({code: 409, 
                    error: 'There is already an account with '
                      + provider + ' that belongs to you'});
                }
                else {
                  // check if a user exists with an email matching the one from
                  // federated profile
                  existsEmail(email, userId, 
                      function(err, existsEmail) {
                    if(err) {
                      callback(err);
                    }
                    else if(existsEmail) {
                      callback({code: 409, 
                        error: 'There is already an account with '
                          + email + ' that belongs to you'});
                    }
                    else {
                      // if no federated user nor matching email found, link
                      CognitoHelper.link(userId, provider, idToken, 
                          refreshToken, profile, function(err, data) {
                        if(err) {
                          callback(err);
                        }
                        else {
                          callback(null, {id: userId, expiresIn: expiresIn});
                        }
                      });
                    }
                  });
                }
              });
            } 
            else {
              // Step 3b. Create a new user account or return an existing one.
              loginFederatedWithToken(provider, idToken, 
                  refreshToken, profile, name, email, function(err, user) {
                if(err) {
                  callback(err);
                }
                else {
                  callback(null, {id: user.id, expiresIn: expiresIn});
                }
              });
            }
          }
        });
      }
    });
  };
  
  /**
   * Retrieves from CognitoSync a refresh token for the federated provider 
   * the user last logged in with. 
   * Exchanges this token with the provider for an access token, 
   * uses the access token to login.
   * Use this to automatically re-login during long running user sessions. 
   * @param {String} identityId - CognitoIdentity ID
   * @param callback - function(err, data)
   */
  CognitoHelper.refreshProvider = function(identityId, callback) {
    CognitoHelper.getRefreshToken(identityId, function(err, dataRefresh) {
      if(err) {
        callback(err);
      }
      else if(!dataRefresh || !dataRefresh.refreshToken) {
        callback({code: 404, error: 'no refresh token found'});
      }
      else {
        var provider = dataRefresh.provider;
        
        //TODO use other providers like paypal, stripe
        if(provider === 'google' 
          || provider === 'amazon' 
          || provider === 'facebook' 
          || provider === 'twitter') {
          var accessTokenUrl = config.providers[provider].accessTokenUrl;
          var params = {
              refresh_token: dataRefresh.refreshToken,
              client_id: config.providers[provider].client_id,
              client_secret: config.providers[provider].client_secret,
              grant_type: 'refresh_token'
          };
          logger.debug('post', params);

          // Step 1. Exchange refresh code for id token.
          request.post(accessTokenUrl, { json: true, form: params }, 
              function(err, response, token) {
            if(err) {
              callback(err);
            }
            else {
              logger.debug('token', token);
              
              var expiresIn = token.expires_in;

              var norm = config.providers[provider].normalize(token);
              logger.debug('norm', norm);
              
              var idToken = norm.idToken;

              // Step 2. Re-login normally with the new id token.
              loginFederatedWithToken(provider, idToken, null, null, null, null,
                  function(err, user) {
                if(err) {
                  callback(err);
                }
                else {
                  callback(null, {token: idToken, expiresIn: expiresIn});
                }
              });
            }
          });
        }
        else {
          //TODO change to callback
          res.send({ token: createJWT(userId) });
        }
      }
    });
  };
	
}

module.exports = CognitoHelper;
