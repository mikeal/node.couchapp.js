var path = require('path')
  , sys = require('sys')
  , fs = require('fs')
  , watch = require('watch')
  , request = require('request')
  , crypto = require('crypto')
  , mimetypes = require('./mimetypes')
  , spawn = require('child_process').spawn
  ;

var h = {'content-type':'application/json', 'accept-type':'application/json'}
  
function loadAttachments (doc, root, prefix) {
  doc.__attachments = doc.__attachments || []
  try {
    fs.statSync(root)
  } catch(e) {
    throw e
    throw new Error("Cannot stat file "+root)
  }
  doc.__attachments.push({root:root, prefix:prefix});
}

function copy (obj) {
  var n = {}
  for (i in obj) n[i] = obj[i];
  return n
}

function playSound () {
  spawn("/usr/bin/afplay", ["/System/Library/Sounds/Blow.aiff"]);
}
  
function createApp (doc, url, cb) {
  var app = {doc:doc}
  
  app.fds = {};
  
  app.prepare = function () {
    var p = function (x) {
      for (i in x) {
        if (i[0] != '_') {
          if (typeof x[i] == 'function') {
            x[i] = x[i].toString()
          }
          if (typeof x[i] == 'object') {
            p(x[i])
          }
        }
      }
    }
    p(app.doc);
    app.doc.__attachments = app.doc.__attachments || []
    app.doc.attachments_md5 = app.doc.attachments_md5 || {}
    app.doc._attachments = app.doc._attachments || {}
  }
  
  var push = function (callback) {
    console.log('Serializing.')
    var doc = copy(app.doc);
    doc._attachments = copy(app.doc._attachments)
    delete doc.__attachments;
    var body = JSON.stringify(doc)
    console.log('PUT '+url)
    request({uri:url, method:'PUT', body:body, headers:h}, function (err, resp, body) {
      if (err) throw err;
      if (resp.statusCode !== 201) throw new Error("Could not push document\n"+body)
      app.doc._rev = JSON.parse(body).rev
      console.log('Finished push. '+app.doc._rev)
      request({uri:url, headers:h}, function (err, resp, body) {
        body = JSON.parse(body);
        app.doc._attachments = body._attachments;
        playSound();
        if (callback) callback()
      })
    })
  }
  
  app.push = function (callback) {
    var revpos
      , pending = 0
      ;
    
    console.log('Preparing.')
    var doc = app.current;
    for (i in app.doc) {
      if (i !== '_rev') doc[i] = app.doc[i]
    }
    app.doc = doc;
    app.prepare();
    revpos = app.doc._rev ? parseInt(app.doc._rev.slice(0,app.doc._rev.indexOf('-'))) : 0;
    
    app.doc.__attachments.forEach(function (att) {
      watch.walk(att.root, function (err, files) {
        for (i in files) { (function (f) {
          pending += 1
          fs.readFile(f, function (err, data) {
            f = f.replace(att.root, app.prefix || '');
            if (f[0] == '/') f = f.slice(1)
            if (!err) {
              var d = data.toString('base64')
                , md5 = crypto.createHash('md5')
                , mime = mimetypes.lookup(path.extname(f).slice(1))
                ;
              md5.update(d)
              md5 = md5.digest('hex')
              if (app.doc.attachments_md5[f] && app.doc._attachments[f]) {
                if (app.doc._attachments[f].revpos === app.doc.attachments_md5[f].revpos && 
                    app.doc.attachments_md5[f].md5 === md5) {   
                  pending -= 1
                  if (pending === 0) {
                    push(callback)
                  }
                  return; // Does not need to be updated.
                }
              }
              app.doc._attachments[f] = {data:d, content_type:mime};
              app.doc.attachments_md5[f] = {revpos:revpos + 1, md5:md5};
            }
            pending -= 1
            if (pending === 0) {
              push(callback)
            }
          })
        })(i)}
      })
    })
    if (!app.doc.__attachments || app.doc.__attachments.length == 0) push(callback);
  }  
  
  app.sync = function (callback) {
    // A few notes.
    //   File change events are stored in an array and bundled up in to one write call., 
    // this reduces the amount of unnecessary processing as we get a lof of change events.
    //   The file descriptors are stored and re-used because it cuts down on the number of bad change events.
    //   And finally, we check the md5 and only push when the document is actually been changed.
    //   A lot of crazy workarounds for the fact that we basically get an event every time someone
    // looks funny at the underlying files and even reading and opening fds to check on the file trigger
    // more events.
    
    app.push(function () {
      var changes = [];
      console.log('Watching files for changes...')
      app.doc.__attachments.forEach(function (att) {
        var pre = att.root
        if (pre[pre.length - 1] !== '/') pre += '/';
        watch.createMonitor(att.root, {ignoreDotFiles:true}, function (monitor) {
          monitor.on("removed", function (f, stat) {
            f = f.replace(pre, '');
            changes.push([null, f]);
          })
          monitor.on("created", function (f, stat) {
            changes.push([f, f.replace(pre, ''), stat]);
          })
          monitor.on("changed", function (f, curr, prev) {
            changes.push([f, f.replace(pre, ''), curr]);
          })
        })
      })
      var check = function () {
        var pending = 0
          , revpos = parseInt(app.doc._rev.slice(0,app.doc._rev.indexOf('-')))
          , dirty = false
          ;
        if (changes.length > 0) {
          changes.forEach(function (change) {
            if (!change[0]) {
              delete app.doc._attachments[change[1]];
              dirty = true;
              console.log("Removed "+change[1]);
            } else {
              pending += 1
              
              fs.readFile(change[0], function (err, data) {
                var f = change[1]
                  , d = data.toString('base64')
                  , md5 = crypto.createHash('md5')
                  , mime = mimetypes.lookup(path.extname(f).slice(1))
                  ;

                md5.update(d)
                md5 = md5.digest('hex')
                pending -= 1
                if (!app.doc.attachments_md5[f] || (md5 !== app.doc.attachments_md5[f].md5) ) {
                  app.doc._attachments[f] = {data:d, content_type:mime};
                  app.doc.attachments_md5[f] = {revpos:revpos + 1, md5:md5};
                  dirty = true;
                  console.log("Changed "+change[0]);
                }
                if (pending == 0 && dirty) push(function () {dirty = false; setTimeout(check, 50)})
                else if (pending == 0 && !dirty) setTimeout(check, 50)
                
              })
            }
            
          })
          changes = []
          if (pending == 0 && dirty) push(function () {dirty = false; setTimeout(check, 50)})
          else if (pending == 0 && !dirty) setTimeout(check, 50)
        } else {
          setTimeout(check, 50);
        }
      }
      setTimeout(check, 50)
    })
  }
  
  if (url.slice(url.length - doc._id.length) !== doc._id) url += '/' + doc._id;
  request({uri:url, headers:h}, function (err, resp, body) {
    if (err) throw err;
    if (resp.statusCode == 404) app.current = {};
    else if (resp.statusCode !== 200) throw new Error("Failed to get doc\n"+body)
    else app.current = JSON.parse(body)
    cb(app)
  })
}

exports.createApp = createApp
exports.loadAttachments = loadAttachments