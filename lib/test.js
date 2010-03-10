var sys = require('sys')

// sandbox.emit = Views.emit;
// sandbox.sum = Views.sum;
// sandbox.log = log;
// sandbox.toJSON = Couch.toJSON;
// sandbox.provides = Mime.provides;
// sandbox.registerType = Mime.registerType;
// sandbox.start = Render.start;
// sandbox.send = Render.send;
// sandbox.getRow = Render.getRow;

var toJSON = JSON.stringify;

function sum (values) {
  var rv = 0;
  for (var i in values) {
    rv += values[i];
  }
  return rv;
}

var resolveModule = function(names, parent, current) {
  if (names.length == 0) {
    if (typeof current != "string") {
      throw ["error","invalid_require_path",
        'Must require a JavaScript string, not: '+(typeof current)];
    }
    return [current, parent];
  }
  // we need to traverse the path
  var n = names.shift();
  if (n == '..') {
    if (!(parent && parent.parent)) {
      throw ["error", "invalid_require_path", 'Object has no parent '+JSON.stringify(current)];
    }
    return resolveModule(names, parent.parent.parent, parent.parent);
  } else if (n == '.') {
    if (!parent) {
      throw ["error", "invalid_require_path", 'Object has no parent '+JSON.stringify(current)];
    }
    return resolveModule(names, parent.parent, parent);
  }
  if (!current[n]) {
    throw ["error", "invalid_require_path", 'Object has no property "'+n+'". '+JSON.stringify(current)];
  }
  var p = current
  current = current[n];
  current.parent = p;
  return resolveModule(names, p, current)
}

function compileMapReduce (func, ddoc, emit) {
  var source = "(function (emit, sum, toJSON, log) { return (" + func.toString() + ")\n});"
  // TODO : make this work without a file
  return process.compile(source, 'nofile').apply(ddoc, [emit, sum, toJSON, function () {}]);
}

function compileView (func, ddoc, start, send, getRow) {
  var envKeys = ['sum', 'toJSON', 'log', 'provides', 'registerType', 
                 'start', 'send', 'getRow', 'require'];
  var source = "function (" + envKeys.join(', ') + ") { return (" + func.toString() + ")\n});"
  var empty = function () {};
  var require = function(name, parent) {
    var exports = {};
    var resolved = resolveModule(name.split('/'), parent, ddoc);
    var source = resolved[0]; 
    parent = resolved[1];
    var s = "function (exports, require) { " + source + " }";
    try {
      var func = process.compile(s);
      func.apply(ddoc, [exports, function(name) {return require(name, parent, source)}]);
    } catch(e) { 
      throw ["error","compilation_error","Module require('"+name+"') raised error "+e.toSource()]; 
    }
    return exports;
  }
  var envValues = [sum, toJSON, empty, empty, empty, start, send, getRow, require]
  return process.compile(source).apply(ddoc, envValues);
}

function testDesignDoc (name, ddoc) {
  for (view in ddoc.views) {
    if (ddoc.views[view].map) {
      var fullname = name+'.views.'+view+'.map';
      sys.print(fullname+' compilation test')
      var m = compileMapReduce(ddoc.views[view].map, ddoc, function(k,v){})
      sys.print('.... passed\n')
      sys.print(fullname+' empty document test.... ')
      try { m({}) ; sys.print('passed\n')}
      catch(e) { sys.print('failed\n')}
      
      if (ddoc.tests && ddoc.tests.views && ddoc.tests.views[view] && ddoc.tests.views[view].map) {
        if (ddoc.tests.views[view].map.expect) {
          sys.print(fullname+' expect tests.... ')
          var docs = ddoc.tests.views[view].map.expect[0];
          var expected = ddoc.tests.views[view].map.expect[1];
          var results = []; 
          var emit = function(k,v) {results.push([k,v])}
          var m = compileMapReduce(ddoc.views[view].map, ddoc, emit);
          docs.forEach(function(doc) {m(doc)});
          if (results.length != expected.length) {
            sys.print('failed (lengths do not match)\n')
          } else {
            var p = true;
            for (var i=0;i<results.length;i+=1) {
              if (toJSON(results[i]) != toJSON(expected[i])) {
                sys.print('\nFAIL: ' + toJSON(results[i]) + ' != ' + toJSON(expected[i]) )
                p = false;
              }
            }
            if (!p) { sys.print('\n') }
            else {sys.print('passed \n')}
          }
        }
      }
    }
  }
}

exports.testDesignDoc = testDesignDoc;