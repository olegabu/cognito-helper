module.exports = {
  AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID || 'your 12 digit aws account id like 123456789012',
  COGNITO_IDENTITY_POOL_ID: process.env.COGNITO_IDENTITY_POOL_ID || 'cognito Identity pool ID like us-east-1:12345678-1234-1234-1234-123456789012 found on https://console.aws.amazon.com/cognito',
  COGNITO_DEVELOPER_PROVIDER_NAME: process.env.COGNITO_DEVELOPER_PROVIDER_NAME || 'Developer provider name like mylogin that you chose as a Custom Authentication provider for your cognito identity pool',
  COGNITO_SEPARATOR: process.env.COGNITO_SEPARATOR || '----',
  COGNITO_DATASET_NAME: process.env.COGNITO_DATASET_NAME || 'profile',
  COGNITO_PASSWORD_RESET_URL: process.env.COGNITO_PASSWORD_RESET_URL || 'http://localhost:8100/app.html#/reset/{email}/{reset}',
  COGNITO_PASSWORD_RESET_BODY: process.env.COGNITO_PASSWORD_RESET_BODY || 'Dear {name}, please follow the link below to reset your password:',
  COGNITO_PASSWORD_RESET_SUBJECT: process.env.COGNITO_PASSWORD_RESET_SUBJECT || 'Password reset',
  COGNITO_PASSWORD_RESET_SOURCE: process.env.COGNITO_PASSWORD_RESET_SOURCE || 'Password reset <noreply@yourdomain.com>',
  
  providers: {
    stripe: {
      accessTokenUrl: 'https://connect.stripe.com/oauth/token',
      peopleApiUrl: 'https://api.stripe.com/v1/account',
      client_secret: process.env.STRIPE_SECRET || 'Secret Key like sk_09zqb1GV2g3mxgkhIlkF2H4zrdsvr found on https://dashboard.stripe.com/account/apikeys',
      normalize: function(token, profile) {
        var id = profile.id;
        return {
          idToken: id,
          name: profile.display_name,
          email: profile.email
        };
      }
    },
    paypal: {
      accessTokenUrl: 'https://api.sandbox.paypal.com/v1/identity/openidconnect/tokenservice',
      peopleApiUrl: 'https://api.sandbox.paypal.com/v1/identity/openidconnect/userinfo?schema=openid',
      client_secret: process.env.PAYPAL_SECRET || 'Secret like Ezqb1GV2g3mxgkhIlkF2H-zqb1GV2g3mxgkhIlkF2H4zrdsvrCS7twZ9PQvyWxjE0F7K8yqslC6IxCz1oW3F found on https://developer.paypal.com/developer/applications',
      normalize: function(token, profile) {
        var id = profile.user_id;
        return {
          idToken: id.substring(id.lastIndexOf('/')+1),
          name: profile.name,
          email: profile.email
        };
      }
    },
    google: {
      accessTokenUrl: 'https://accounts.google.com/o/oauth2/token',
      peopleApiUrl: 'https://www.googleapis.com/plus/v1/people/me/openIdConnect',
      client_id: process.env.GOOGLE_CLIENT_ID || ' Client ID like 123456789012-zqb1GV2g3mxgkhIlkF2H4zrdsvrCS7tw.apps.googleusercontent.com found on https://console.developers.google.com',
      client_secret: process.env.GOOGLE_SECRET || 'secret code like zqb1GV2g3mxgkhIlkF2H4z_6 can be downloaded in json on https://console.developers.google.com',
      normalize: function(token, profile) {
        return {
          idToken: token.id_token,
          name: profile ? profile.name : null,
              email: profile ? profile.email : null
        };
      }
    },
    amazon: {
      accessTokenUrl: 'https://api.amazon.com/auth/o2/token',
      peopleApiUrl: 'https://api.amazon.com/user/profile',
      client_id: process.env.AMAZON_CLIENT_ID || 'Client ID like amzn1.application-oa2-client.zqb1GV2g3mxgkhIlkF2H4zrdsvrCS7tw found on https://sellercentral.amazon.com/gp/homepage.html',
      client_secret: process.env.AMAZON_SECRET || 'Client Secret like zqb1GV2g3mxgkhIlkF2H4zrdsvrCS7twZ9PQvyWxjE0F7K8yqslC6IxCz1oW3FmQ',
      normalize: function(token, profile) {
        return {
          idToken: token.access_token,
          name: profile ? profile.name : null,
              email: profile ? profile.email : null
        };
      }
    }
  }
};