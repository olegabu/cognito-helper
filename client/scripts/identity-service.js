/**
 * @class IdentityService
 * @classdesc
 * @ngInject
 */
function IdentityService($log, $q, $http, $state, $auth) {
  
  // jshint shadow: true
  var IdentityService = this;
  
  IdentityService.baseUrl = null;
  IdentityService.localCredentialsKey = null;
  IdentityService.localUserKey = null;
  IdentityService.loginState = null;
  
  var getProfileKey = function(provider) {
    return  'profile' + provider;
  };
  
  IdentityService.checkAuthenticated = function() {
    var d = $q.defer();
    
    if (!$auth.isAuthenticated()) {
      $log.debug('checkAuthenticated rejecting authenticated');
      //no need to $state.go(IdentityService.loginState);
      d.reject('logged out');
    }
    else {
      $log.debug('checkAuthenticated resolving authenticated', 
          $auth.getPayload().sub);
      d.resolve($auth.getPayload().sub);
    }
    
    return d.promise;
  };
  
  function RefreshCredentials(params) {          
    AWS.Credentials.call(this);
    
    if(params.Credentials) {
      this.accessKeyId = params.Credentials.AccessKeyId;
      this.secretAccessKey = '' + params.Credentials.SecretKey;
      this.sessionToken = params.Credentials.SessionToken;
      //this.expireTime = new Date(new Date(params.Credentials.Expiration).getTime() - 59 * 60 * 1000).toJSON();
      this.expireTime = params.Credentials.Expiration;
    }
    else {
      this.accessKeyId = params.accessKeyId;
      this.secretAccessKey = params.secretAccessKey;
      this.sessionToken = params.sessionToken;
      this.expireTime = params.expireTime;
    }
    
    this.refresh = function(callback) {
      $log.debug('*********** refresh ***********');
      var d = $q.defer();
      
      getCreds(d);
      
      d.promise.then(
          function(data) {
            callback(null);
            $log.debug('*********** resolved refresh ***********', data);
          },
          function(err) {
            callback({message: 'cannot refresh', error: err});
            $log.debug('*********** failed refresh ***********', err);
          }
      );
    };
    
    this.needsRefresh = function() {
      var ret = new Date() > new Date(this.expireTime);
      //$log.debug('*********** needsRefresh ' + ret, this);
      return ret;
    };
  }
  RefreshCredentials.prototype = Object.create(AWS.Credentials.prototype);
  
  var getCreds = function(d) {
    IdentityService.checkAuthenticated()
    .then(function() {
      $http.post(IdentityService.baseUrl + 'auth/credentials')
      .success(function(response) {
        $log.debug('getCreds got from server response.Credentials', 
            response.Credentials);
        
        var creds = new RefreshCredentials(response);
        
        AWS.config.update({credentials: creds});
        
        localStorage.setItem(IdentityService.localCredentialsKey, 
            JSON.stringify(creds, 
                ['accessKeyId','secretAccessKey','sessionToken','expireTime']));
        
        $log.debug('getCreds resolving from server AWS.config.credentials', 
            AWS.config.credentials);
        
        d.resolve(AWS.config.credentials);
      })
      .error(function(err) {
        $log.error('getCreds cannot get from server', err);
        
        d.reject(err);
      });
    });
  };
  
  IdentityService.getCredentials = function() {
    var d = $q.defer();
    
    var creds = null;
    var now = new Date();
    
    if(!AWS.config.credentials/* || !AWS.config.credentials.expireTime*/) {
      var localCreds = JSON.parse(
          localStorage.getItem(IdentityService.localCredentialsKey));
      
      if(localCreds) {
        creds = new RefreshCredentials(localCreds);
        $log.debug('getCredentials stored creds', creds);
      }
    }
    else {
      creds = AWS.config.credentials;
      $log.debug('getCredentials memory credentials', creds);
    }
    
    if(!creds) {
      $log.debug('getCredentials neither stored nor memory creds');
      
      getCreds(d);
    }
    else if(new Date(creds.expireTime) < now) {
      $log.debug('getCredentials need refresh ' + creds.expireTime, now);

      getCreds(d);
    }
    else {
      AWS.config.update({credentials: creds});
      
      $log.debug('getCredentials resolving existing', AWS.config.credentials);
      
      d.resolve(AWS.config.credentials);
    }
    
    return d.promise;
  };
  
  IdentityService.getUser = function(fromServer) {
    var d = $q.defer();

    var localUser = JSON.parse(
        localStorage.getItem(IdentityService.localUserKey));
    if(localUser && !fromServer) {
      $log.debug('getUser local', localUser);
      d.resolve(localUser);
    }
    else {
      $http.post(IdentityService.baseUrl + 'auth/me')
      .success(function(user) {
        if(user.id) {
          localStorage.setItem(
              IdentityService.localUserKey, JSON.stringify(user));
          
          $log.debug('getUser got', user);
          d.resolve(user);
        }
        else {
          toastr.error('invalid user');
          d.reject(user);
        }
      })
      .error(function (err) {
        toastr.error(err, 'cannot get user');
        d.reject(err);
      });
    }
    
    return d.promise;
  };
  
  IdentityService.forgotPassword = function(email) {   
    var d = $q.defer();
    
    $http.post(IdentityService.baseUrl + 'auth/forgot', {email: email})
    .success(function() {
      d.resolve();
    })
    .error(function(err) {
      d.reject(err);
    });
    
    return d.promise;
  };
  
  IdentityService.getProviderProfileFromUser = function(user, provider) {
    var profile = null;
    var p = user[getProfileKey(provider)];
    if(p) {
      profile = JSON.parse(p);
      $log.debug('profile', profile);
    }
    return profile;
  };
  
  IdentityService.getProviderProfile = function(provider) {
    var d = $q.defer();
    
    IdentityService.getUser(true)
    .then(
        function(user) {
          d.resolve(IdentityService.getProviderProfileFromUser(user, provider));
        },
        function(err) {
          toastr.error(err, 'cannot get user');
          d.reject(err);
        }
    );
    
    return d.promise;
  };
  
  IdentityService.logout = function() {
    delete AWS.config.credentials;
    localStorage.removeItem(IdentityService.localCredentialsKey);
    localStorage.removeItem(IdentityService.localUserKey);
    
    $state.go(IdentityService.loginState);
  };
  
  IdentityService.updatePassword = function(password) {  
    var d = $q.defer();
    
    $http.post(IdentityService.baseUrl + 'auth/update', {password: password})
    .success(function() {
      toastr.success('updated password');
      d.resolve();
    })
    .error(function(err) {
      toastr.error(err, 'cannot update password');
      d.reject(err);
    });
    
    return d.promise;
  };
}

angular.module('identityService', ['satellizer'])
.config(function($provide) {
  $provide.provider('IdentityService', function() {
    var baseUrl = null;
    this.setBaseUrl = function(o) {
      baseUrl = o;
    };
    
    var loginState = null;
    this.setLoginState = function(o) {
      loginState = o;
    };
    
    var authenticatedState = null;
    this.setAuthenticatedState = function(o) {
      authenticatedState = o;
    };
    
    var localCredentialsKey = null;
    this.setLocalCredentialsKey = function(o) {
      localCredentialsKey = o;
    };
    
    var localUserKey = null;
    this.setLocalUserKey = function(o) {
      localUserKey = o;
    };
    
    this.$get = function($injector) {
      var inst = $injector.instantiate(IdentityService);
      inst.baseUrl = baseUrl;
      inst.loginState = loginState || 'auth.login';
      inst.authenticatedState = authenticatedState || 'auth.profile';
      inst.localCredentialsKey = localCredentialsKey || 'credentials';
      inst.localUserKey = localUserKey || 'user';
      return inst;
    };
});
})
;
