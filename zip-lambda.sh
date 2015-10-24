#!/bin/bash

zip -r cognito-lambda.zip \
node_modules/async \
node_modules/aws-sdk \
node_modules/bcryptjs \
node_modules/js-sha256 \
node_modules/jwt-simple \
node_modules/lodash \
node_modules/moment \
node_modules/randomstring \
node_modules/lodash \
node_modules/log4js \
node_modules/moment \
node_modules/randomstring \
node_modules/request \
node_modules/string-format \
node_modules/lodash \
node_modules/dotenv \
.env \
server-config.js \
config.js \
aws.js \
cognito-helper.js \
lambda.js

exit 0