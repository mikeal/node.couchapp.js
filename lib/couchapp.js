var sys = require('sys'),
    path = require('path'),
    fs = require('fs'),
    mimetypes = require('./dep/mimetypes'),
    sync = require('./sync');

function normalizeDesignDoc (ddoc, parent) {
  for (x in ddoc) {
    if (parent || x[0] != '_') {
      if (typeof ddoc[x] == 'function') {
        ddoc[x] = ddoc[x].toString();
      } else if (typeof(ddoc[x]) == 'object' && ddoc[x].length === undefined){
        normalizeDesignDoc(ddoc[x], ddoc)
      }
    }
  }
  return ddoc;
}

function walk (dir, files) {
  if (!files) { files = [] }
  newfiles = fs.readdirSync(dir);
  newfiles.forEach(function (f) {
    if (f[0] === '.') {return ;} // Skip dot files
    var f = path.join(dir, f)
    // exclude . files
    if (f[0] == '.') {return;}
    var stats = fs.statSync(f)
    if (stats.isDirectory()) {
      walk(f, files);
    } else if (stats.isFile()) {
      files.push(f);
    }
  })
  return files;
}

function loadAttachments (ddoc, dir) {
  var files = walk(dir);
  if (!ddoc._attachments) {
    ddoc._attachments = {};
  }
  files.forEach(function (f) {
    f = f.slice(dir.length);
    ddoc._attachments[f] = function (callback) {
      fs.readFile(path.join(dir, f), function (error, data) {
        if (error) {
          sys.puts(sys.inspect([dir, f]))
          callback(error);
        } else {
          callback(undefined, false, mimetypes.lookup(path.extname(f).slice(1)), data.length, function (c) {c(undefined, data)})
        }
      })
    }
  })
}

function loadFiles (ddoc, dir) {
  var files = walk(dir);
  files.forEach(function (f) {
    var s = f.slice(dir.length).split('/');
    var obj = ddoc;
    for (var i=0;i<s.length;i+=1) {
      if (i == (s.length - 1)) {
        obj[s[i]] = fs.readFileSync(f);
      } else if (s[i].length != 0){
        if (!obj[s[i]]) {
          obj[s[i]] = {};
        }
        obj = obj[s[i]];
      }
    }
  })
}

function loadModules (ddoc, dir) {
  var files = walk(dir);
  files.forEach(function (f) {
    var s = f.slice(dir.length).split('/');
    var obj = ddoc;
    for (var i=0;i<s.length;i+=1) {
      if (i == (s.length - 1)) {
        obj[s[i].slice(0, s[i].length - path.extname(f).length)] = fs.readFileSync(f);
      } else if (s[i].length != 0){
        if (!obj[s[i]]) {
          obj[s[i]] = {};
        }
        obj = obj[s[i]];
      }
    }
  })
}


exports.loadAttachments = loadAttachments;
exports.loadFiles = loadFiles;
exports.loadModules = loadModules;

exports.sync = function (ddoc, uri, callback) {
  return sync.sync(normalizeDesignDoc(ddoc), uri, undefined, callback)
}



