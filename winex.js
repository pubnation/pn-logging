// Generated by CoffeeScript 1.10.0
var HOST_NAME, Handlers, WORKER_ID, _Log, clientIp, cluster, extend, factory, os, stripNulls, uncaughtLogger, url,
  slice = [].slice,
  hasProp = {}.hasOwnProperty,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend1 = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cluster = require("cluster");

os = require("os");

url = require("url");

extend = require("deep-extend");

HOST_NAME = os.hostname();

WORKER_ID = (function() {
  var ref, ref1, ref2, wid;
  wid = (ref = (ref1 = process.env.NODE_WORKER_ID) != null ? ref1 : (ref2 = cluster.worker) != null ? ref2.id : void 0) != null ? ref : null;
  if (wid) {
    return "w" + wid;
  } else {
    return "m";
  }
})();

_Log = {
  error: function() {
    var args;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    return console.log.apply(this, ["[ERROR]"].concat(args));
  }
};

uncaughtLogger = function(err, cleanup) {
  var error1, log, other, ref, ref1;
  if (cleanup == null) {
    cleanup = function() {};
  }
  try {
    log = new _Log({
      type: "uncaught_exception",
      error: err
    });
    return log.error("Uncaught exception");
  } catch (error1) {
    other = error1;
    console.log((err ? (ref = err.stack) != null ? ref : err : "Unknown"));
    console.log("Error: Hit additional error logging the previous error.");
    return console.log((other ? (ref1 = other.stack) != null ? ref1 : other : "Unknown"));
  } finally {
    if (typeof cleanup === "function") {
      cleanup();
    }
  }
};

Handlers = {
  logUncaughtException: function(err) {
    return uncaughtLogger(err);
  },
  uncaughtException: function(err) {
    return uncaughtLogger(err, function() {
      return process.exit(1);
    });
  },
  createUncaughtHandler: function(server, opts) {
    var kill;
    if (opts == null) {
      opts = {
        timeout: 30000
      };
    }
    kill = function() {
      return process.exit(1);
    };
    return function(err) {
      return uncaughtLogger(err, function() {
        var timeout;
        timeout = setTimeout(kill, opts.timeout);
        if (server != null) {
          return server.close(function() {
            clearTimeout(timeout);
            return kill();
          });
        } else {
          return kill();
        }
      });
    };
  },
  createExpressHandler: function(express, opts) {
    var expressHandler;
    expressHandler = express.errorHandler(opts);
    return function(err, req, res, next) {
      var log;
      log = new _Log({
        req: req,
        res: res,
        error: err,
        meta: {
          type: "unhandled_error"
        }
      });
      log.error("unhandled error");
      return expressHandler(err, req, res, next);
    };
  }
};

stripNulls = function(obj) {
  var k, v;
  for (k in obj) {
    if (!hasProp.call(obj, k)) continue;
    v = obj[k];
    if (v === null) {
      delete obj[k];
    }
  }
  return obj;
};

clientIp = function(req) {
  var firstIp, forwards, ipAddr, ips, ref, ref1;
  ipAddr = req != null ? (ref = req.connection) != null ? ref.remoteAddress : void 0 : void 0;
  forwards = req != null ? typeof req.header === "function" ? req.header("x-forwarded-for") : void 0 : void 0;
  if (forwards) {
    ips = forwards.split(",");
    firstIp = ((ref1 = ips != null ? ips[0] : void 0) != null ? ref1 : "").replace(/^\s+|\s+$/, "");
    if (firstIp) {
      ipAddr = firstIp;
    }
  }
  return ipAddr;
};

factory = function(winstonLogger, classMeta, opts) {
  var Log, NopLog, useNop;
  if (classMeta == null) {
    classMeta = {};
  }
  if (opts == null) {
    opts = {};
  }
  useNop = opts.nop === true;
  Log = (function() {
    var fn, i, len, level, ref;

    function Log(opts) {
      var ref, ref1;
      if (opts == null) {
        opts = {};
      }
      this.baseMeta = bind(this.baseMeta, this);
      this.meta = extend({}, (ref = opts.meta) != null ? ref : {});
      this.type = (ref1 = opts.type) != null ? ref1 : null;
      this.errNoStack = opts.errNoStack === true;
      this.info404 = opts.info404 === true;
      if (opts.req) {
        this.addReq(opts.req);
      }
      if (opts.res) {
        this.addRes(opts.res);
      }
      if (opts.error) {
        this.addError(opts.error);
      }
    }

    Log.prototype.DEFAULT_TYPE = "request";

    Log.middleware = function(opts) {
      if (opts == null) {
        opts = {};
      }
      return function(req, res, next) {
        var _end, log;
        log = new Log(opts);
        log.addReq(req);
        res.locals._log = log;
        _end = res.end;
        res.end = function(chunk, encoding) {
          var level, ref;
          res.end = _end;
          res.end(chunk, encoding);
          if (!res.locals._log) {
            return;
          }
          level = "info";
          if ((400 <= (ref = res.statusCode) && ref < 500)) {
            if (!(res.statusCode === 404 && log.info404)) {
              level = "warning";
            }
          }
          if (res.statusCode >= 500) {
            level = "error";
          }
          if (log.level != null) {
            level = log.level;
          }
          log.addRes(res);
          return log[level]("request");
        };
        return next();
      };
    };

    Log.prototype.addReq = function(req) {
      var maxChars, path, pathLength, query, queryChars, ref, ref1, ref2, ref3, ref4, ref5, ref6, urlObj;
      if (req == null) {
        req = {};
      }
      maxChars = 200;
      urlObj = req.url && url.parse(req.url);
      path = (ref = urlObj != null ? urlObj.pathname : void 0) != null ? ref : "";
      query = (ref1 = urlObj != null ? urlObj.query : void 0) != null ? ref1 : "";
      queryChars = Array.from(query).length;
      pathLength = Array.from(path).length;
      if (pathLength > maxChars) {
        path = Array.from(path).slice(0, maxChars).join('');
      }
      if (queryChars > maxChars) {
        query = Array.from(query).slice(0, maxChars).join('');
      }
      return this.meta = extend(this.meta, stripNulls({
        reqClient: clientIp(req),
        reqHost: (ref2 = req != null ? (ref3 = req.headers) != null ? ref3.host : void 0 : void 0) != null ? ref2 : null,
        reqMethod: (ref4 = req != null ? req.method : void 0) != null ? ref4 : null,
        reqPath: path,
        reqQuery: query,
        reqQueryChars: queryChars,
        reqUser: (ref5 = req != null ? (ref6 = req.user) != null ? ref6.email : void 0 : void 0) != null ? ref5 : null
      }));
    };

    Log.prototype.addRes = function(res) {
      if (res == null) {
        res = {};
      }
      return this.meta = extend(this.meta, {
        resStatus: res.statusCode.toString()
      });
    };

    Log.prototype.addMeta = function(meta) {
      if (meta == null) {
        meta = {};
      }
      return this.meta = extend(this.meta, meta);
    };

    Log.prototype.addError = function(error) {
      var errObj, ref, ref1, ref2, ref3, ref4;
      if (error == null) {
        error = "unknown";
      }
      errObj = {
        errMsg: (ref = error != null ? error.message : void 0) != null ? ref : error.toString()
      };
      if (!this.errNoStack) {
        extend(errObj, stripNulls({
          errArgs: Array.from(((ref1 = error != null ? error["arguments"] : void 0) != null ? ref1 : "").toString()).slice(0, 100).join(''),
          errType: (ref2 = error != null ? error.type : void 0) != null ? ref2 : null,
          errStack: (ref3 = error != null ? error.stack : void 0) != null ? ref3 : null,
          errCode: (ref4 = error != null ? error.code : void 0) != null ? ref4 : null,
          errKnown: 0
        }));
      }
      return this.meta = extend(this.meta, errObj);
    };

    Log.aggregateMeta = function() {
      var metas;
      metas = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      return Log.patchMeta.apply(Log, [{}].concat(metas));
    };

    Log.patchMeta = function() {
      var i, key, len, m, meta, metas, obj, ref, ref1, value;
      metas = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      metas = (function() {
        var i, len, results;
        results = [];
        for (i = 0, len = metas.length; i < len; i++) {
          m = metas[i];
          if (m != null) {
            results.push(m);
          }
        }
        return results;
      })();
      obj = metas.length > 0 ? metas[0] : {};
      ref = metas.slice(1);
      for (i = 0, len = ref.length; i < len; i++) {
        meta = ref[i];
        for (key in meta) {
          if (!hasProp.call(meta, key)) continue;
          value = meta[key];
          if (typeof value === "number") {
            obj[key] = ((ref1 = obj[key]) != null ? ref1 : 0) + value;
          } else if ((value != null ? value.concat : void 0) != null) {
            if (obj[key] == null) {
              obj[key] = [];
            }
            obj[key] = obj[key].concat(value);
          } else {
            obj[key] = value;
          }
        }
      }
      return obj;
    };

    Log.prototype.baseMeta = function(meta, level) {
      var ref;
      if (meta == null) {
        meta = {};
      }
      if (level == null) {
        level = null;
      }
      return extend({
        date: (new Date()).toISOString(),
        level: level || meta.level,
        env: process.env.NODE_ENV,
        type: (ref = meta != null ? meta.type : void 0) != null ? ref : this.DEFAULT_TYPE,
        serverHost: HOST_NAME,
        serverId: WORKER_ID,
        serverPid: process.pid
      }, classMeta, meta);
    };

    Log.prototype._makeMeta = function(level, meta) {
      var ref, ref1, ref2, type;
      if (meta == null) {
        meta = {};
      }
      type = (ref = (ref1 = (ref2 = meta.type) != null ? ref2 : this.meta.type) != null ? ref1 : this.type) != null ? ref : this.DEFAULT_TYPE;
      meta = extend(this.baseMeta(null, level), this.meta, meta);
      meta.type = type;
      return meta;
    };

    ref = Object.keys(winstonLogger.levels);
    fn = function(level) {
      return Log.prototype[level] = function(msg, metaOrCb, cb) {
        var callback, meta;
        if (metaOrCb == null) {
          metaOrCb = {};
        }
        if (cb == null) {
          cb = null;
        }
        if (cb != null) {
          meta = metaOrCb != null ? metaOrCb : {};
          callback = cb;
        } else if (metaOrCb != null) {
          meta = typeof metaOrCb === "object" ? metaOrCb : {};
          callback = typeof metaOrCb === "function" ? metaOrCb : null;
        }
        meta = this._makeMeta(level, meta);
        return winstonLogger[meta.level].apply(Log, [msg, meta, callback]);
      };
    };
    for (i = 0, len = ref.length; i < len; i++) {
      level = ref[i];
      fn(level);
    }

    return Log;

  })();
  NopLog = (function(superClass) {
    var fn, i, len, level, ref;

    extend1(NopLog, superClass);

    function NopLog() {
      return NopLog.__super__.constructor.apply(this, arguments);
    }

    NopLog.middleware = function() {
      return function(req, res, next) {
        res.locals._log = new NopLog();
        return next();
      };
    };

    ref = Object.keys(winstonLogger.levels);
    fn = function(level) {
      return NopLog.prototype[level] = function() {};
    };
    for (i = 0, len = ref.length; i < len; i++) {
      level = ref[i];
      fn(level);
    }

    return NopLog;

  })(Log);
  _Log = Log;
  if (useNop === true) {
    _Log = NopLog;
  }
  return _Log;
};

module.exports = {
  Handlers: Handlers,
  factory: factory
};
