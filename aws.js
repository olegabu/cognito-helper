var AWS = require('aws-sdk');

if(!AWS.config.region)
	AWS.config.region = 'us-east-1';

var proxy = process.env.https_proxy 
|| process.env.HTTPS_PROXY 
|| process.env.http_proxy 
|| process.env.HTTP_PROXY;

if(proxy) {
	var HttpProxyAgent = require('https-proxy-agent');
	AWS.config.httpOptions = {agent: new HttpProxyAgent(proxy)};
	console.log('aws is using https-proxy-agent for proxy ' + proxy);
}

module.exports = AWS;
