/*eslint no-process-env:0 no-param-reassign:0*/

'use strict';

var util = require('util');
var winston = require('winston');
var winex = require('./winex');
const { format } = require('logform');
const { combine, json, prettyPrint } = format;

var sysLogLevels;

require('winston-loggly-bulk');


sysLogLevels = {
  levels: {
    emerg: 0,
    alert: 1,
    crit: 2,
    error: 3,
    warning: 4,
    notice: 5,
    info: 6,
    debug: 7,
  },
};

var prettyPrintWithJson = combine(
    prettyPrint(),
    json()
);

/**
 * Create a log object for public consumption.
 *
 * Usage:
 *
 * l = new Log(options);
 * l.info('blah', {});
 * l.error('oops', {}, err);
 * app.use(l.middleware());
 *
 * @param {Object}   options            Options
 * @param {Object[]} options.transports Should look like:
 *                                      [
 *                                        {
 *                                          Console: {
 *                                            level: 'info',
 *                                            json: true,
 *                                            prettyPrint: true
 *                                          }
 *                                        },
 *                                        {
 *                                          ...
 *                                        }
 *                                      ]
 * @param {Object} options.meta Meta defaults.
 * @param {boolean} options.rawTransports Pass true when the Winston transports passed in are instantiated (default false).

 *
 * @return {void}
 */
function Log(options) {
  var logTransports;
  var winstonOpts;
  var winstonLog;

  if (!options || !options.transports) {
    throw new Error('No transports found');
  }

  if (options.rawTransports){
    logTransports = options.transports
  } else {
    logTransports = options.transports.map(function(t) {
      var cls = Object.keys(t)[0];
      var opts = t[cls];
      var Transport = winston.transports[cls];
      return new Transport(opts);
    });
  }

  winstonOpts = {
    levels: sysLogLevels.levels,
    formats: prettyPrintWithJson,
    transports: logTransports,
  };

  if (options.meta)
    this.defaultMeta = options.meta

  winstonLog = winston.createLogger(winstonOpts);
  this._winexConstructor = winex.factory(winstonLog, options.meta);

  /*
    Opts for request-logging middleware (applies to all logs generated by the
    instance of the middleware):

    @type       {String} type description (e.g., "server" or "client")
    @meta       {Object} descriptive fields to attach to log
    @errNoStack {boolean} When true, don't include stack when logging errors.
    @info404    {boolean} When true, log 404s as info instead of warning.
  */
  this.middleware = this._winexConstructor.middleware;
}

// https://github.com/jonschlinkert/isobject/blob/master/index.js
function isObject(val) {
  return val != null && typeof val === 'object' && Array.isArray(val) === false;
}

/**
 * Helper function for attaching methods to the logger prototype.
 *
 * @param {string} level  Logging level, e.g. 'debug'.
 *
 * @return {Function} Logging method to attach to the Log prototype.
 */
function _logger(level) {
  return function(message, meta, error, req, res) {
    if (isObject(message)) {
      meta = meta ? Object.assign(meta, message.meta) : message.meta;
      error = error ? error : message.error;
      req = req ? req : message.req;
      res = res ? res : message.res;
      message = message.message || message.msg;
    }
    var log = new this._winexConstructor({meta: this.defaultMeta});

    if (util.types.isNativeError(meta)) {
      error = meta;
      meta = null;
    }

    if (meta) {
      log.addMeta(meta);
    }

    if (req)
      log.addReq(req)

    if (res)
      log.addRes(res)

    if (error) {
      log.addError(error);
    }

    log[level](message);
  };
}

Object.keys(sysLogLevels.levels).forEach(function(level) {
  Log.prototype[level] = _logger(level);
});

module.exports = {
  Log: Log,
};
