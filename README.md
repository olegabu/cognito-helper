# cognito-helper

Wrapper for Amazon Cognito library with methods common for a web 
or mobile app, like authenticating with email and password, signup, 
federated login, link accounts, reset password etc.

## Why

[Amazon Cognito](https://aws.amazon.com/cognito/) can provide a complete 
authentication backend for a web or mobile app, 
but its library can be simplified by wrapping into a module with common methods.

## Functionality

* login with email and password
* signup with name, email and password
* login with Amazon federated providers: Google, Facebook, Amazon, Twitter
* login with any OAuth providers: PayPal, Stripe et al.
* link accounts to be able to login into the same account both by email/password and by OAuth
* change password
* send email with password reset link
* store and retrieve user profile
* support long running sessions: store and use OAuth provider's refresh token
* retrieve AWS Credentials to call other AWS services like DynamoDb and S3. 

## How it works

cognito-helper uses the server side [AWS SDK for JavaScript](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-intro.html) to call
Amazon Cognito.

### Login with email and password

To sign up with name, email and password, cognito-helper calls 
[CognitoIdentity](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CognitoIdentity.html) to create a record in a Cognito identity pool with a *developer identifier*: 
the user's unique email. It then stores the user's name and hashed password in 
[CognitoSync's](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CognitoSync.html)
dataset `profile`. 
During login, cognito-helper uses CognitoIdentity to look up the user by email, 
and CognitoSync to retrieve and compare the password.

### Login with OAuth providers integrated with Cognito

To login with OAuth login providers integrated with Amazon 
(Google, Facebook, Twitter, Amazon), provider's access code is passed from the 
frontend upon succesful authentication to the backend, where cognito-helper 
calls CognitoIdentity to verify the code.
cognito-helper attempts to retrieve user's profile from the provider, and 
stores the name and complete profile in the CognitoSync `profile` dataset. 
If provider's profile coniains user's email, it is attached to CognitoIdentity
as a *developer identifier*, making it possible to look up the user by email.

### Login with any OAuth provider

cognito-helper treats logins with OAuth providers not integrated with Cognito 
(PayPal, Stripe et al.) similar to email/password, as 
*developer managed identities* in CognitoIdentity. The login process is similar
to the one described above, but the access code is verified by cognito-helper
directly with the OAuth provider. Provider's own user id is used as a 
*developer identifier* in the identity pool.
	
### AWS Credentials

For the web or mobile app to call other AWS services like DynamoDB or S3, 
it needs the Credentials for the user logged in with Cognito. cognito-helper 
can retrieve these Credentials for the app, making it possible to call these 
services directly from the client, making it a serverless app.

For long running sessions, cognito-helper will renew the AWS Credentials 
automatically using a stored refresh token from the OAuth provider the user
is logged in with.

## On the server side

An authentication backend based on cognito-helper can be run 
in an express server, or serverless: 
as an [AWS Lambda](https://aws.amazon.com/lambda/) function 
fronted with [Amazon API Gateway](https://aws.amazon.com/api-gateway).

## On the client side

While cognito-helper based backend can be used from any platform via any 
http client, it's been tested on the client side with 
[satellizer](https://github.com/sahat/satellizer), a  
Token-based AngularJS Authentication library. 
Our demo web application for cognito-helper uses satellizer.

This project has been inspired by satellizer, and complements its backend.

## REST interface

When cognito-helper is run as an authentication backend it exposes the 
following resources:

http method | url | cognito-helper method | description
------------|-----|----------|------------
POST | /auth/login | [login](#module_cognito-helper..CognitoHelper.login) | login with email and password
POST | /auth/signup | [signup](#module_cognito-helper..CognitoHelper.signup) | sign up with name, email and password
POST | /auth/me | [getProfile](#module_cognito-helper..CognitoHelper.getProfile) | retrieve user profile
POST | /auth/update | [updatePassword](#module_cognito-helper..CognitoHelper.updatePassword) | update user password
POST | /auth/credentials | [getCredentials](#module_cognito-helper..CognitoHelper.getCredentials) | get AWS Credentials to call other AWS services
POST | /auth/forgot | [forgotPassword](#module_cognito-helper..CognitoHelper.forgotPassword) | send email with password reset link
POST | /auth/:provider | [loginFederated](#module_cognito-helper..CognitoHelper.loginFederated) | login with OAuth provider or link an account
POST | /auth/unlink | [unlink](#module_cognito-helper..CognitoHelper.unlink) | unlink an OAuth account

## Install

```sh
npm install cognito-helper
```

## Configure Cognito

Before you can use cognito-helper you need to set up AWS Cognito and 
its permissions. 
You need to have an AWS account with sufficient priviliges to manage Cognito 
and IAM.

### Create Cognito Identity Pool

On [Amazon Cognito Console](https://console.aws.amazon.com/cognito) click 
*Create new identity pool* and pick any name for it.
In *Authentication providers* section on the *Custom* tab enter any name for
the *Developer provider name*. This custom provider will authenticate by
email/password and custom OAuth providers and is implemented by cognito-helper. 

If you'd like to use Amazon integrated OAuth login providers, 
enter your application identifiers in *Authentication providers* section. 

Accept default roles on the next screen: 
one of these roles your users will assume when authenticated. You can later
add permissions for your users to call other AWS services like DynamoDb or S3. 
You can do it on [IAM Console](https://console.aws.amazon.com/iam): create a 
managed policy and attach it to this role. 

On the final, *Getting Started* screen, find and copy Identity Pool ID; 
you will need to put it later into your config.

### Create policy

cognito-helper needs permissions to create identities in your Cognito Identity 
pool on your behalf. You define these permissions in a managed policy in 
[IAM Console](https://console.aws.amazon.com/iam). 

Navigate to *Policies*, click
*Create Policy*, select *CreateYourOwn Policy*, give it a name like 
`cognito-backend-policy` and paste the contents of   
cognito-backend-policy.json, which gives access to all of your identity pools, 
allows to log events and send emails (remove this if you're not using SES). 

If you'd like to restrict to only one identity pool, use the template 
cognito-backend-explicit-policy.json.

### Create user

In order to use Cognito with permissions declared in the previous step, 
cognito-helper needs to be run as a user with the above policy attached.

Navigate to *Users*, click *Create New Users*, enter a user name like 
`cognito-backend-user`, check *Generate an access key for each user*. 

Copy *User Security Credentials*: Access Key ID and Secret Access Key, you will
need to set them as environment variables when running cognito-helper.

Find your newly created user and in *Permissions* section click on 
*Attach Policy*; select `cognito-backend-policy`.

cognito-helper, running as express server or embedded, will
initialize AWS from the environment variables, will become `cognito-backend-user`, 
will get its permissions from `cognito-backend-policy` to manage identities 
in your pool.

## Configure cognito-helper

You need to tell cognito-helper Identity Pool ID and 
the access keys of the user your created above.

The module requires sensitive configuration like AWS keys, login providers' 
client ids and secret keys. It is best to keep them outside of the source 
control. Put them into environment variables:
```sh
export AWS_SECRET_ACCESS_KEY=4zqb1GV2g3mxgkhIlkF2H4zzqb1GV2g3mxgkhIlA
export AWS_ACCESS_KEY_ID=A1234567890123456789Q
...
```
or put them into into [`.env`](https://www.npmjs.com/package/dotenv) file (kept out of the source control). 
The `.env` is required if you'd like to run as AWS 
Lambda function as Lambda doesn't currently support environment variables.
```
AWS_SECRET_ACCESS_KEY=4zqb1GV2g3mxgkhIlkF2H4zzqb1GV2g3mxgkhIlA
AWS_ACCESS_KEY_ID=A1234567890123456789Q
...
```
or edit directly the config.js and server-config.js.

```js
module.exports = {
  AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID || '123456789012',
  COGNITO_IDENTITY_POOL_ID: process.env.COGNITO_IDENTITY_POOL_ID || 'us-east-1:12345678-1234-1234-1234-123456789012',
  ...
```

Please note the 
environment variables override the config files. If you decide to put directly 
into config.js, note `AWS_SECRET_ACCESS_KEY` and `AWS_ACCESS_KEY_ID` 
will still need to be set as environment variables 
per standard AWS credentials practice.

## Test

Ok now the minimum has been setup: Cognito can be used for signup and login 
with email and password. That's what the tests do:

```sh
npm test
```

## Run as express server

If the tests passed, let's run cognito-helper as an authentication backend for 
the sample web app:

```sh
npm start
```

Open your browser with [http://localhost:8100](http://localhost:8100) and try to login with user@test.com and test123 for password -- you've already created this user  by running the tests. Login with Google and other OAuth providers does not work yet, you need to configure them in the next step.

## Configure OAuth identity providers

If you'd like your users to be able to login with OAuth providers like Google, Facebook, Amazon etc. you need to tell cognito-helper client ids and secret keys assigned to your web or mobile app by these providers.

cognito-helper will use these ids and secret keys to exchange access code returned by the provider's authentication form.

Add providers to config.js but better put sensitive keys like client_secret into environment variables or into `.env`, ex.: `PAYPAL_SECRET`, `GOOGLE_SECRET`.

```js
...
providers: {
    paypal: {
      accessTokenUrl: 'https://api.sandbox.paypal.com/v1/identity/openidconnect/tokenservice',
      peopleApiUrl: 'https://api.sandbox.paypal.com/v1/identity/openidconnect/userinfo?schema=openid',
      client_secret: process.env.PAYPAL_SECRET,
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
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_SECRET,
      normalize: function(token, profile) {
        return {
          idToken: token.id_token,
          name: profile ? profile.name : null,
          email: profile ? profile.email : null
        };
      }
    }
...
```

## Configure Amazon Lambda 

This is needed if you're planning to run a serverless authentication backend with AWS Lambda. 

### Create role

Lambda does not run as a separate user but assumes a role. Creating this role is
similar to creating a user above: 
you need to create a new role, attach a policy to it 
so your Lambda is permissioned by the policy to manage your identity pool.

On [IAM Console](https://console.aws.amazon.com/iam) navigate to *Roles*, click
*Create New Role*, pick a name like `cognito-backend-role`, then choose AWS Lambda
on the the next *Select Role Type* screen, then choose `cognito-backend-policy` on
the next *Attach Policy* screen, and finally click *Create Role*.

### Create Lambda

First zip up cognito-helper with required modules into `cognito-lambda.zip`: 
```sh
npm run lambda
```

On the [Lambda Console](https://console.aws.amazon.com/lambda) click 
*Create a Lambda function*, skip blueprints to *Configure function*. 
Give it a name like `cognito-lambda`, choose *Upload a .ZIP file*, select 
`cognito-lambda.zip` you just built.
Put `lambda.handler` for *Handler*, this tells AWS to invoke 
`exports.handler` in lambda.js.
For its *Role* pick `cognito-backend-role` you created in the previous step.

Now cognito-helper running in `cognito-lambda` will assume 
`cognito-backend-role` to which you attached `cognito-backend-policy` 
that allows to manage your identity pool.

Let's test the lambda. For the *Actions - Configure sample event* put the email/password of the test user you've already created by running the tests:

```json
{
"operation": "login",
"payload": {"email":"user@test.com","password":"test123"}
}
```

The non error response will indicate successful authentication and return a jwt token. You can store this token on the client side, in the browser local storage  for example, and pass it to the lambda to identify a logged in user when required. The lambda will verify the token was created by it (encrypted by the lambda's own `TOKEN_SECRET`). The token is encoded by the [jwt-simple](https://github.com/hokaccha/node-jwt-simple) module. 

This method to update password requires the user to be logged in and thus requires the jwt token. You can copy the token returned from the previous login test:

```json
{
"operation": "update",
"authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cy1lYXN0LTE6NTNmYWQxMmEtMDUxYS00Y2ZmLWFlNzgtYTA3ODQ1MjAwNTc1IiwiaWF0IjoxNDQ1NzE1MTEwLCJleHAiOjE0NDYzMTk5MTB9.hTHQUcf-I2_eNSKRSFBKSYod3R6Yta9pSJaLChVv2y4",
"payload": {"password":"test123"}
}
``` 

### Create API Gateway endpoint

If you'd like to call your `cognito-lambda` from a web or mobile app, 
you can add an http endpoint in AWS API Gateway. 

The REST interface is the same as the one exposed by running cognito-helper 
as express server. A web or mobile client can switch
seamlessly from your own managed backend to the one managed by AWS with 
API Gateway and Lambda.

On the [API Gateway Console](https://console.aws.amazon.com/apigateway) click
*Create API* and give it a name like `cognito-api`. 

On the next screen create resources and methods according to the REST interface 
listed above.

The below instructions may seem like a long chore but that's how verbose 
AWS API Gateway setup is at the moment. 
Just follow them closely, accept defaults if not specified, 
and don't worry, you'll have to do it only once.

Since we have variable provider names in the REST urls let's leave them 
parameterized as `{operation}`. Create Resources and Methods like this tree:

```
/
`-- /auth
    `-- /auth/{operation}
        |-- POST
        `-- OPTIONS
```

To do that, put `{operation}` into *Resource Path*.

We'll create Methods so they can pass parameters and Authorization header 
to our lambda and respond with headers that allow CORS.

* POST
  * Method Response
    * Http Status 200
      * Response Headers: Access-Control-Allow-Origin
      * Response Models: Content type=application/json, Models=empty
    * Http Status 400
      * Response Headers: Access-Control-Allow-Origin
    * Http Status 401
      * Response Headers: Access-Control-Allow-Origin
    * Http Status 404
      * Response Headers: Access-Control-Allow-Origin
    * Http Status 409
      * Response Headers: Access-Control-Allow-Origin
  * Integration Response
    * Lambda Error Regex: default
      * Method response status: 200
      * Header Mappings: Response header=Access-Control-Allow-Origin, Mapping value='*'
      * Mapping Templates: Content-Type=application/json, Output passthrough
    * Lambda Error Regex: Bad Request.*
      * Method response status: 400
      * Header Mappings: Response header=Access-Control-Allow-Origin, Mapping value='*'
    * Lambda Error Regex: Unauthorized.*
      * Method response status: 401
      * Header Mappings: Response header=Access-Control-Allow-Origin, Mapping value='*'
    * Lambda Error Regex: Not Found.*
      * Method response status: 404
      * Header Mappings: Response header=Access-Control-Allow-Origin, Mapping value='*'
    * Lambda Error Regex: Conflict.*
      * Method response status: 409
      * Header Mappings: Response header=Access-Control-Allow-Origin, Mapping value='*'
  * Integration Request
    * Integration type: Lambda Function
    * Lambda Function: cognito-lambda
    * Mapping Templates
      * Content-Type:application/json
      * Mapping template:
```json
{
"operation": "$input.params('operation')",
"authorization": "$input.params().header.get('Authorization')",
"payload": $input.json('$')
}
```      
      
* OPTIONS
  * Integration Request
    * Integration type: Mock Integration
  * Method Response
    * Http Status 200
      * Response Headers
        * Access-Control-Allow-Origin
        * Access-Control-Allow-Headers
  * Integration Response
    * Lambda Error Regex: default
      * Method response status: 200
      * Header Mappings
        * Response header=Access-Control-Allow-Headers, Mapping value='Content-Type,Authorization'
        * Response header=Access-Control-Allow-Origin, Mapping value='*'
        
Finally, click on *Deploy API*, give the deployment stage a name like `dev` 
and note the *Invoke URL* of the deployed api. 
You can now put it into your sample web app
config and run it against the AWS directly -- you now have a serverless
authentication backend.

```js
angular.module('config', [])
.constant('config', 
{
dev: {
  awsConfigRegion: 'us-east-1',
  authBaseUrl: 'https://jqrejhif5c.execute-api.us-east-1.amazonaws.com/dev/',
...  
```

## Use embedded

```js
var CognitoHelper = require('cognito-helper');

// load config from env variables or .env file
var cognito = new CognitoHelper();

// or load config from file
var cognito = new CognitoHelper(require('./myconfig.js'));
```

## API Reference

<a name="module_cognito-helper..CognitoHelper"></a>
### cognito-helper~CognitoHelper
**Kind**: inner class of <code>[cognito-helper](#module_cognito-helper)</code>  

* [~CognitoHelper](#module_cognito-helper..CognitoHelper)
  * [new CognitoHelper(config)](#new_module_cognito-helper..CognitoHelper_new)
  * [.getRecords(identityId, keys, callback)](#module_cognito-helper..CognitoHelper.getRecords)
  * [.updateRecords(identityId, dataCreate, dataReplace, dataRemove, callback)](#module_cognito-helper..CognitoHelper.updateRecords)
  * [.getRefreshToken(identityId, callback)](#module_cognito-helper..CognitoHelper.getRefreshToken)
  * [.getCredentials(identityId, callback)](#module_cognito-helper..CognitoHelper.getCredentials)
  * [.signup(name, email, password, callback)](#module_cognito-helper..CognitoHelper.signup)
  * [.updatePassword(identityId, password, callback)](#module_cognito-helper..CognitoHelper.updatePassword)
  * [.forgotPassword(email, callback)](#module_cognito-helper..CognitoHelper.forgotPassword)
  * [.login(email, password, reset, callback)](#module_cognito-helper..CognitoHelper.login)
  * [.describe(identityId, finalCallback)](#module_cognito-helper..CognitoHelper.describe)
  * [.getProfile(identityId, finalCallback)](#module_cognito-helper..CognitoHelper.getProfile)
  * [.getId(provider, token, callback)](#module_cognito-helper..CognitoHelper.getId)
  * [.getDeveloperTokens(identityId, callback)](#module_cognito-helper..CognitoHelper.getDeveloperTokens)
  * [.link(identityId, linkProvider, linkToken, linkRefreshToken, linkProfile, callback)](#module_cognito-helper..CognitoHelper.link)
  * [.unlink(identityId, linkProvider, linkToken, callback)](#module_cognito-helper..CognitoHelper.unlink)
  * [.loginFederated(provider, code, clientId, redirectUri, userId, callback)](#module_cognito-helper..CognitoHelper.loginFederated)
  * [.refreshProvider(identityId, callback)](#module_cognito-helper..CognitoHelper.refreshProvider)

<a name="new_module_cognito-helper..CognitoHelper_new"></a>
#### new CognitoHelper(config)
Wrapper for Amazon Cognito library with methods common for a web 
or mobile app, like authenticating with email and password, signup, 
federated login, link accounts, reset password etc.


| Param | Type | Description |
| --- | --- | --- |
| config | <code>Object</code> | default config settings can be loaded from config.js |

<a name="module_cognito-helper..CognitoHelper.getRecords"></a>
#### CognitoHelper.getRecords(identityId, keys, callback)
Retrieves records from a CognitoSync profile dataset.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| keys | <code>Array</code> | only records whose names start with these keys |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.updateRecords"></a>
#### CognitoHelper.updateRecords(identityId, dataCreate, dataReplace, dataRemove, callback)
Updates record in a user's profile with CognitoSync.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| dataCreate | <code>Object</code> | map of the records to create |
| dataReplace | <code>Object</code> | map of the records to replace |
| dataRemove | <code>Object</code> | map of the records to remove |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.getRefreshToken"></a>
#### CognitoHelper.getRefreshToken(identityId, callback)
Retrieves a refresh token for the federated provider the user last logged 
in with. The refresh token is kept in a profile dataset in CognitoSync.
Use to call the provider to obtain a new access token.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.getCredentials"></a>
#### CognitoHelper.getCredentials(identityId, callback)
Retrieves AWS Credentials to call AWS services 
the Authenticated User Role permits.
If the credentials expired due to a time limit on federated login session, 
uses saved refresh token to re-login with the federated provider, and 
uses the new access token.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.signup"></a>
#### CognitoHelper.signup(name, email, password, callback)
Creates a user in CognitoIdentity with an email as a developer identifier.
Stores user name and password in CognitoSync.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>String</code> | user's name |
| email | <code>String</code> | email uniquely identifies a user |
| password | <code>String</code> |  |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.updatePassword"></a>
#### CognitoHelper.updatePassword(identityId, password, callback)
Updates password record in a user's profile with CognitoSync.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| password | <code>String</code> | new password |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.forgotPassword"></a>
#### CognitoHelper.forgotPassword(email, callback)
Sends an email with a link to temporarily login the user
instead of a forgotten password. Uses Amazon SimpleEmailService (SES). 
Email body, subject and source are defined in the config. 
Make sure the email source (from email) is authorized to send emails 
with SES.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| email | <code>String</code> | email uniquely identifies a user |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.login"></a>
#### CognitoHelper.login(email, password, reset, callback)
Logs in with the user's email stored as a developer identifier in 
CognitoIdentity and either a password or a reset token emailed in a 
forgot password email.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| email | <code>String</code> | email uniquely identifies a user |
| password | <code>String</code> | null if passing reset |
| reset | <code>String</code> | random string emailed by forgotPassword; null if passing password |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.describe"></a>
#### CognitoHelper.describe(identityId, finalCallback)
Retrieves from CognitoIdenity a list of federated providers which the user 
has logins with. Use to display a list of linked logins in a
user's profile.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| finalCallback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.getProfile"></a>
#### CognitoHelper.getProfile(identityId, finalCallback)
Retrieves from CognitoIdenity a list of federated providers which a user 
has logins with. 
Retrieves user name, email, profile from CognitoSync.
Use to display full user profile.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| finalCallback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.getId"></a>
#### CognitoHelper.getId(provider, token, callback)
Retrieves CognitoIdenity ID given either a federated provider token 
or user email.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>String</code> | name of a federated login provider like google,  amazon, facebook, twitter, stripe, paypal; or null for email as token |
| token | <code>String</code> | access token gotten from provider thru oauth  or user's email |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.getDeveloperTokens"></a>
#### CognitoHelper.getDeveloperTokens(identityId, callback)
Retrieves all developer (non federated) identifiers like user emails or
ids with federated providers not integrated with AWS like PayPal or Stripe.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.link"></a>
#### CognitoHelper.link(identityId, linkProvider, linkToken, linkRefreshToken, linkProfile, callback)
Establishes a link to a login with federated provider.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| linkProvider | <code>String</code> | name of the federated provider to link |
| linkToken | <code>String</code> | access token from the federated provider |
| linkRefreshToken | <code>String</code> | refresh token  from the federated provider to save |
| linkProfile | <code>String</code> | json formatted user profile  with the federated provider to save |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.unlink"></a>
#### CognitoHelper.unlink(identityId, linkProvider, linkToken, callback)
Removes a link to a login with federated provider.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| linkProvider | <code>String</code> | name of the federated provider to unlink |
| linkToken | <code>String</code> | access token from the federated provider |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.loginFederated"></a>
#### CognitoHelper.loginFederated(provider, code, clientId, redirectUri, userId, callback)
Logs in with a federated provider.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| provider | <code>String</code> | name of the federated provider to login with |
| code | <code>String</code> | access code returned from an oauth call to the  federated provider after a successful authorization |
| clientId | <code>String</code> | oauth client id of your web or mobile app with the federated provider |
| redirectUri | <code>String</code> | redirect url returned from an oauth call to  the provider |
| userId | <code>String</code> | if a user CognitoIdentity ID is given, means the user is already logged in and a subsequent login with the federated  provider will link the provider login with the current login |
| callback |  | function(err, data) |

<a name="module_cognito-helper..CognitoHelper.refreshProvider"></a>
#### CognitoHelper.refreshProvider(identityId, callback)
Retrieves from CognitoSync a refresh token for the federated provider 
the user last logged in with. 
Exchanges this token with the provider for an access token, 
uses the access token to login.
Use this to automatically re-login during long running user sessions.

**Kind**: static method of <code>[CognitoHelper](#module_cognito-helper..CognitoHelper)</code>  

| Param | Type | Description |
| --- | --- | --- |
| identityId | <code>String</code> | CognitoIdentity ID |
| callback |  | function(err, data) |


* * *

Documented by [jsdoc-to-markdown](https://github.com/jsdoc2md/jsdoc-to-markdown).
