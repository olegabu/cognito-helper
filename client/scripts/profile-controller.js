/**
 * @class ProfileController
 * @classdesc
 * @ngInject
 */
function ProfileController($auth, $log, $q, $http,
    emailRegex, IdentityService, user) {
  var ctl = this;
  
  ctl.emailRegex = emailRegex;
  
  ctl.user = user;
  
  ctl.passwordOpen = false;
  
  var updateUserLink = function(provider, link) {
    ctl.user[provider] = link;
    localStorage.setItem(IdentityService.localUserKey, JSON.stringify(ctl.user));
  };
  
  /**
   * Update user password.
   */
  ctl.updatePassword = function() {
    IdentityService.updatePassword(ctl.password)
    .then(function() {ctl.passwordOpen = false;});
  };

  /**
   * Link third-party provider.
   */
  ctl.link = function(provider) {
    $auth.link(provider)
    .then(
        function() {
          toastr.success('You have successfully linked ' + provider);
          updateUserLink(provider, true);
        },
        function(err) {
          toastr.error(err.data.error || err.data.message, 'cannot link');
        }
    );
  };

  /**
   * Unlink third-party provider.
   */
  ctl.unlink = function(provider) {
    $auth.unlink(provider)
    .then(
        function() {
          toastr.success('You have successfully unlinked ' + provider);
          updateUserLink(provider, false);
        },
        function(err) {
          toastr.error(err.data.error || err.data.message, 'cannot unlink');
        }
    );
  };
}

angular.module('profileController', ['commonConstants'])
.controller('ProfileController', ProfileController);