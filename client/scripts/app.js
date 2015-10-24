angular.module('cognito-helper', [
                                  'ngMessages',
                                  'ui.router',
                                  'satellizer',
                                  'commonConstants',
                                  'config',
                                  'identityService',
                                  'password-directives',
                                  'auth-controllers',
                                  'profileController'])
                       
.config(function($stateProvider, $urlRouterProvider, $authProvider, config,
    IdentityServiceProvider) {

  var cfg = config.dev;
  
  console.log('start app.config', cfg);

  AWS.config.region = cfg.awsConfigRegion;
  
  // used by both IdentityService and $auth
  var authBaseUrl = cfg.authBaseUrl;
  
  IdentityServiceProvider.setBaseUrl(authBaseUrl);
  IdentityServiceProvider.setLoginState('public.login');
  IdentityServiceProvider.setAuthenticatedState('auth.profile');
  
  $urlRouterProvider.otherwise('/login');
  
  $stateProvider
  /*
   * Public
   */
  .state('public', {
    abstract: true,
    templateUrl: '../partials/navbar.html',
  })
  .state('public.login', {
    url: '/login',
    templateUrl: '../partials/login.html',
    controller: 'LoginController',
  })
  .state('public.signup', {
    url: '/signup',
    templateUrl: '../partials/signup.html',
    controller: 'SignupController',
  })
  .state('public.forgot', {
    url: '/forgot',
    templateUrl: '../partials/forgot.html',
    controller: 'ForgotController as ctl',
  })
  .state('public.reset', {
    url: '/reset/{email}/{reset}',
    controller: 'ResetController',
  })
  .state('public.logout', {
    url: '/logout',
    template: null,
    controller: 'LogoutController'
  })

  /*
   * Authenticated
   */
  .state('auth', {
    abstract: true,
    url: '/auth',
    templateUrl: '../partials/navbar.html',
    resolve: {
      authenticated: function(IdentityService) {
        return IdentityService.checkAuthenticated();
      },
      credentials: function(authenticated, IdentityService) {
        return IdentityService.getCredentials();
      },
      user: function(authenticated, IdentityService) {
        return IdentityService.getUser();
      },
    }
  })
  .state('auth.profile', {
    url: '/profile',
    templateUrl: '../partials/profile.html',
    controller: 'ProfileController as ctl',
  })
  ; // $stateProvider
  

  /*
   * Satellizer
   */
  $authProvider.baseUrl = authBaseUrl;

  // this allows to set Access-Control-Allow-Headers=* on the server side
  $authProvider.withCredentials = false;
  
  $authProvider.facebook({
    clientId: cfg.auth.facebook.clientId
  });

  $authProvider.google({
    clientId: cfg.auth.google.clientId,
    optionalUrlParams: ['display','access_type'/*,'approval_prompt'*/],
    accessType: 'offline',
    /*approvalPrompt: 'force',*/
  });

  $authProvider.oauth2({
    name: 'stripe',
    url: '/auth/stripe',
    clientId: cfg.auth.stripe.clientId,
    authorizationEndpoint: 'https://connect.stripe.com/oauth/authorize',
    redirectUri: window.location.origin || window.location.protocol + '//' + window.location.host,
    scope: ['read_write'],
    requiredUrlParams: ['scope'],
    popupOptions: { width: 600, height: 700 },
  });

  $authProvider.oauth2({
    name: 'paypal',
    url: '/auth/paypal',
    clientId: cfg.auth.paypal.clientId,
    authorizationEndpoint: cfg.auth.paypal.authorizationEndpoint || 'https://www.sandbox.paypal.com/webapps/auth/protocol/openidconnect/v1/authorize',
    redirectUri: window.location.origin || window.location.protocol + '//' + window.location.host,
    scope: ['profile', 'email'],
    scopePrefix: 'openid',
    scopeDelimiter: ' ',
    requiredUrlParams: ['scope'],
    popupOptions: { width: 400, height: 550 },
  });

  $authProvider.oauth2({
    name: 'amazon',
    url: '/auth/amazon',
    clientId: cfg.auth.amazon.clientId,
    redirectUri: window.location.origin || window.location.protocol + '//' + window.location.host,
    authorizationEndpoint: 'https://amazon.com/ap/oa',
    scope: ['profile'],
    requiredUrlParams: ['scope'],
    popupOptions: { width: 710, height: 500 },
  });

  $authProvider.twitter({
    url: '/auth/twitter'
  });
  
  console.log('finished app config');

}) // .config

;