module.exports = {
  TOKEN_SECRET: process.env.TOKEN_SECRET || 'A hard to guess string',
  EXPIRES_IN: process.env.EXPIRES_IN || 7 * 24 * 3600, /* sets jwt exp time in seconds, overrides expires_in coming from federated providers */
  PORT: process.env.PORT || 8100
};