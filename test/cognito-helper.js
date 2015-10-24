var assert = require('assert');
var logger = require('log4js').getLogger('CognitoHelperTest');
var sha256 = require('js-sha256').sha256;
var randomstring = require('randomstring');
var async = require('async');

describe('CognitoHelper.', function() {
  this.timeout(4000);

  var CognitoHelper = require('../cognito-helper');
  var cognito = new CognitoHelper();
  
  var name = 'Test User';
  var email = 'user@test.com';
  var password = 'test123';

  before('create test user if does not exist', function(done) {
    cognito.signup(name, email, password, function(err) {
      if(err) {
        assert.equal(err.code, 409);
      }
      done();
    });
  });

  describe('Signup and login with email and password.', function() {

    describe('#login', function() {
      it('authenticates with email and password', function(done) {
        cognito.login(email, password, null, done);
      });
      it('fails with wrong email', function(done) {
        cognito.login(email + 'x', password, null, function(err) {
          assert.equal(err.code, 404);
          done();
        });
      });
      it('fails with wrong password', function(done) {
        cognito.login(email, password + 'x', null, function(err) {
          assert.equal(err.code, 401);
          done();
        });
      });
    });

    describe('#signup', function() {
      it('fails to signup when a user with email already exists', 
          function(done) {
        cognito.signup(name, email, password, function(err) {
          assert.equal(err.code, 409);
          done();
        });
      });
    });

    describe('#forgotPassword', function() {
      it('emails reset link to the user', function(done) {
        cognito.forgotPassword(email, function(err, data) {
          if(err) {
            return done(err);
          }
          cognito.login(email, null, data, done);
        });
      })
    });

    describe('#getId', function() {
      it('returns id of user with given email', function(done) {
        cognito.getId(null, email, done);
      })
    });

    /*describe('#exists', function() {
      it('returns true if user with given email exists', 
          function(done) {
        cognito.exists(null, email, function(err, data) {
          assert.equal(data, true);
          done();
        });
      });
      it('returns false if user with given email does not exist', 
          function(done) {
        cognito.exists(null, email + 'x', function(err, data) {
          assert.equal(data, false);
          done();
        });
      });
    });*/

    describe('Manage user profile.', function() {
      var id;

      before('retrieve user id', function(done) {
        cognito.getId(null, email, function(err, data) {
          if(err) {
            return done(err);
          }
          id = data.IdentityId;
          done();
        });
      });

      describe('#getProfile', function() {
        it('retrieves user profile', function(done) {
          cognito.getProfile(id, function(err, data) {
            if(err) {
              return done(err);
            }
            else {
              assert.equal(data.email, email);
              assert.equal(data.name, name);
              assert.equal(data.password, true);
              assert.equal(data.displayName, name);
              done();
            }
          });
        });
      });

      describe('#describe', function() {
        it('retrieves user ids with fed and dev providers', function(done) {
          cognito.describe(id, function(err, data) {
            if(err) {
              return done(err);
            }
            else {
              assert.equal(data.email, email);
              done();
            }
          });
        });
      });

      describe('#getCredentials', function() {
        it('retrieves aws credentials', function(done) {
          cognito.getCredentials(id, done);
        });
      });

      describe('#getDeveloperTokens', function() {
        it('retrieves developer ids', function(done) {
          cognito.getDeveloperTokens(id, function(data) {
            assert.notEqual(data.indexOf(email), -1);
            done();
          });
        });
      });

      describe('#getRecords', function() {
        it('retrieves records from profile dataset', function(done) {
          cognito.getRecords(id, ['name', 'password'], function(err, data) {
            if(err) {
              return done(err);
            }
            else {
              assert.equal(data.name, name);
              assert.equal(data.password, sha256(password));
              done();
            }
          });
        });
      });

      describe('#updateRecords', function() {
        it('updates records in profile dataset', function(done) {
          // does not seem can create a key that have been deleted, 
          // thus create a new key each test
          var k = 'testkey' + randomstring.generate();
          var t = {};
          t[k] = 'testvalue';
          var t2 = {};
          t2[k] = 'testvalue2';

          // create t
          cognito.updateRecords(id, t, null, null, function(err, data) {
            if(err) {
              return done(err);
            }
            else {
              cognito.getRecords(id, [k], function(err, data) {
                if(err) {
                  return done(err);
                }
                else {
                  logger.debug('create getRecords', data);
                  assert.equal(data[k], t[k]);

                  // replace with t2
                  cognito.updateRecords(id, null, t2, null, 
                      function(err, data) {
                    if(err) {
                      return done(err);
                    }
                    else {
                      cognito.getRecords(id, [k], function(err, data) {
                        if(err) {
                          return done(err);
                        }
                        else {
                          logger.debug('replace getRecords', data);
                          assert.equal(data[k], t2[k]);

                          // remove
                          cognito.updateRecords(id, null, null, t, 
                              function(err, data) {
                            if(err) {
                              return done(err);
                            }
                            else {
                              cognito.getRecords(id, [k], function(err, data) {
                                if(err) {
                                  return done(err);
                                }
                                else {
                                  logger.debug('remove getRecords', data);
                                  assert(!data[k]);
                                  done();
                                }
                              });
                            }
                          }); // updateRecords remove
                        }
                      });
                    }
                  }); // updateRecords replace
                }
              });
            }
          }); // updateRecords create
        });
      }); // #updateRecords

      describe('#updatePassword', function() {
        it('updates password', function(done) {
          cognito.updatePassword(id, password, function(err, data) {
            if(err) {
              return done(err);
            }
            cognito.getRecords(id, ['password'], function(err, data) {
              if(err) {
                return done(err);
              }
              else {
                assert.equal(data.password, sha256(password));
                done();
              }
            });
          });
        })
      });

    }); // Manage user profile

  }); // Signup and login with email and password

  describe.skip('Login with federated provider.', function() {
    var fed = [{provider: 'amazon', email: process.env.AMAZON_TEST_EMAIL},
               {provider: 'google', email: process.env.GOOGLE_TEST_EMAIL}];
    
    var id;
    
    var getFederatedIdAndToken = function(f, callback) {
      cognito.getId(null, f.email, function(err, data) {
        if(err) {
          return callback(err);
        }
        f.id = data.IdentityId;

        cognito.refreshProvider(f.id, function(err, data) {
          if(err) {
            return callback(err);
          }
          f.token = data.token;
          callback(null);
        });
      });
    };
    
    var checkRemainingAndLinked = function(remainId, linkId, provider, done) {
      async.parallel({
        remain: function(callback) {
          cognito.describe(remainId, callback);
        },
        link: function(callback) {
          cognito.describe(linkId, callback);
        }
      }, 
      function(err, results) {
        if(err) {
          return done(err);
        }
        logger.debug('remain', results.remain);
        logger.debug('link', results.link);
        
        assert.equal(results.remain[provider], true);
        assert.equal(Object.keys(results.link).length, 1);
        
        done();
      });
    };

    before('retrieve id, federated user id and fresh token', function(done) {
      async.parallel({
        id: function(callback) {
          cognito.getId(null, email, callback);
        },
        fed0: function(callback) {
          getFederatedIdAndToken(fed[0], callback);
        },
        fed1: function(callback) {
          getFederatedIdAndToken(fed[1], callback);
        }
      }, 
      function(err, results) {
        if(err) {
          return done(err);
        }
        id = results.id.IdentityId;
        logger.debug('id', id);
        logger.debug('fed', fed);
        done();
      });
    });

    describe('#link', function() {
      
      it('links federated to email login', function(done) {
        cognito.link(id, fed[0].provider, fed[0].token, null, null, 
            function(err, data) {
          if(err) {
            return done(err);
          }
          checkRemainingAndLinked(id, fed[0].id, fed[0].provider, done);
        });
      });

      it.skip('links email login to federated', function(done) {
        cognito.link(fed[0].id, null, email, null, null, 
            function(err, data) {
          if(err) {
            return done(err);
          }
          checkRemainingAndLinked(fed[0].id, id, fed[0].provider, done);
        });
      });

      it.skip('links then unlinks federated and federated', function(done) {
        cognito.link(fed[0].id, fed[1].provider, fed[1].token, null, null, 
            function(err, data) {
          if(err) {
            return done(err);
          }
          checkRemainingAndLinked(fed[0].id, fed[1].id, fed[0].provider, done);

          cognito.unlink(fed[0].id, fed[1].provider, fed[1].token,  
              function(err, data) {
            if(err) {
              return done(err);
            }
            checkRemainingAndLinked(fed[0].id, fed[1].id, fed[0].provider, done);
          });
        });
      });
      
    });
      
  }); // Login with federated provider

}); // CognitoHelper
