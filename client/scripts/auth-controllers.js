/**
 * @class LoginController
 * @classdesc
 * @ngInject
 */
function LoginController($scope, $state, $auth, emailRegex, IdentityService) {
  $scope.emailRegex = emailRegex;
  
  $scope.data = {};
  
  $scope.login = function() {
    $auth.login(
        {
          email: $scope.email || $scope.data.email, 
          password: $scope.password  || $scope.data.password
        }
    )
    .then(function() {
      $state.go(IdentityService.authenticatedState);
      toastr.success('You have successfully logged in');
    })
    .catch(function(err) {
      toastr.error(err.data.error || err.data.message || err.data.errorMessage, 'cannot login');
    });
  };
  
  $scope.authenticate = function(provider) {
    $auth.authenticate(provider, null)
    .then(function() {
      toastr.success('You have successfully authenticated');
      $state.go(IdentityService.authenticatedState);
    })
    .catch(function(err) {
      toastr.error(err.data.error || err.data.message || err.data.errorMessage, 'cannot authenticate');
    });
  };
}

/**
 * @class LogoutController
 * @classdesc
 * @ngInject
 */
function LogoutController($scope, $state, $auth, IdentityService) {
  IdentityService.logout();
  
  $auth.logout()
  .then(function() {
    toastr.success('You have been logged out');
  });
}

/**
 * @class SignupController
 * @classdesc
 * @ngInject
 */
function SignupController($scope, $state, $log, $auth, 
    emailRegex, IdentityService) {
  $scope.emailRegex = emailRegex;
  
  $scope.signup = function() {
    $auth.signup(
        {
          name: $scope.name,
          email: $scope.email,
          password: $scope.password
        })
        .then(function(data) {
          // automatically login on signup
          $auth.setToken(data.data.token);
          toastr.success('You have successfully signed up');
          $state.go(IdentityService.authenticatedState);
        })
        .catch(function(err) {
          toastr.error(err.data.error || err.data.message || err.data.errorMessage, 'cannot signup');
        });
  };
  
  $scope.authenticate = function(provider) {
    $auth.authenticate(provider, null)
    .then(function() {
      toastr.success('You have successfully signed up');
      $state.go(IdentityService.authenticatedState);
    })
    .catch(function(err) {
      toastr.error(err.data.error || err.data.message || err.data.errorMessage, 'cannot authenticate');
    });
  };
}

/**
 * @class ForgotController
 * @classdesc
 * @ngInject
 */
function ForgotController($scope, $log, emailRegex, IdentityService) {
  $scope.emailRegex = emailRegex;
  
  $scope.forgot = function() {
    IdentityService.forgotPassword($scope.email)
    .then(
        function() {
          toastr.success('Sent email with password reset');
        },
        function(err) {
          toastr.error(err.error, 'cannot reset password');
        }
    );
  };
}

/**
 * @class ResetController
 * @classdesc
 * @ngInject
 */
function ResetController($auth, $stateParams, $state, IdentityService) {
  $auth.login({ email: $stateParams.email, reset: $stateParams.reset}, 
      IdentityService.authenticatedPath)
      .then(
          function() {
            $state.go(IdentityService.authenticatedState);
            toastr.success('logged in with reset');
          },
          function(err) {
            toastr.error(err.error, 'cannot login with reset');
          }
      );
}

/**
 * @class NavbarController
 * @classdesc
 * @ngInject
 */
function NavbarController($scope, $auth) {
  $scope.isAuthenticated = function() {
    return $auth.isAuthenticated();
  };
}

angular.module('auth-controllers', ['identityService','commonConstants'])
.controller('LoginController', LoginController)
.controller('LogoutController', LogoutController)
.controller('SignupController', SignupController)
.controller('ForgotController', ForgotController)
.controller('ResetController', ResetController)
.controller('NavbarController', NavbarController)
;