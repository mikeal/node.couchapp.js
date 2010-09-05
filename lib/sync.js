var sys = require('sys'),
    fs = require('fs'),
    http = require('http'),
    path = require('path'),
    url = require('url'),
    base64 = require('./dep/base64'),
    mimetypes = require('./dep/mimetypes');

var request = function (uri, method, body, headers, client, encoding, callback) {
  if (typeof uri == "string") {
    uri = url.parse(uri);
  }
  if (!headers) {
    headers = {'content-type':'application/json', 'accept':'application/json'};
  }
  if (!headers.host) {
    headers.host = uri.hostname;
    if (uri.port) {
      headers.host += (':'+uri.port)
    }
  }
  if (body) {
    headers['content-length'] = body.length;
  }
  if (!uri.port) {
    uri.port = 80;
  }
  if (!client) { 
    client = http.createClient(uri.port, uri.hostname);
  }
  
  var clientErrorHandler = function (error) {callback(error ? error : "clientError")}
  
  client.addListener('error', clientErrorHandler);
  if (uri.auth) {
    headers.authorization = "Basic " + base64.encode(uri.auth);
  }
  var pathname = uri.search ? (uri.pathname + uri.search) : uri.pathname
  
  var request = client.request(method, pathname, headers)
  
  request.addListener('error', function (error) {callback(error ? error : "requestError")})
    
  if (body) {
    request.write(body);
  }
  
  request.addListener("response", function (response) {
    var buffer = '';
    response.addListener("data", function (chunk) {
      buffer += chunk;
    })
    response.addListener("end", function () {
      client.removeListener("error", clientErrorHandler);
      callback(undefined, response, buffer);
    })
  })
  request.end()
  return client;
}

binaryContentTypes = ['application/octet-stream', 'application/ogg', 'application/zip', 'application/pdf',
                      'image/gif', 'image/jpeg', 'image/png', 'image/tiff', 'image/vnd.microsoft.icon',
                      'multipart/encrypted', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
                      'application/msword', 'application/x-dvi', 'application/x-shockwave-flash', 
                      'application/x-stuffit', 'application/x-rar-compressed', 'application/x-tar']

var guessEncoding = function (contentEncoding, contentType) {
  var encoding = "utf8";
  if (contentEncoding == 'gzip') {
    encoding = "binary";
  } else if (contentType) {
    if (contentType.slice(0,6) == 'video/' || contentType.slice(0,6) == 'audio/') {
      encoding = "binary";
    } else if (binaryContentTypes.indexOf(contentType) != -1) {
      encoding = "binary";
    }
  }
  return encoding;
}

var watchers = {}

var sync = function (ddoc, couchurl, rev, callback) {  
  if (!ddoc._id) {
    sys.puts("You must include a document id in order to sync")
    throw "You must include a document id in order to sync"
  }
  if (ddoc._id.slice(0, '_design/'.length) != '_design/') {
    ddoc._id = '_design/' + ddoc._id
  }
  if (!ddoc._rev && rev === undefined) {
    var uri = (couchurl[couchurl.length - 1] == '/') ? (couchurl + ddoc._id) : (couchurl + '/' + ddoc._id)
    request(uri, "GET", null, undefined, undefined, undefined, function (error, response, body) {
      if (error) {
        if (callback) {
          callback(error); return
        } else {
          sys.puts("Error "+error); return;
        }
      }
      if (response.statusCode == 200) {
        ddoc._rev = JSON.parse(body)._rev;
      }
      sync(ddoc, couchurl, false, callback);
    })
  } else {
    
    if (rev) {
      ddoc._rev = rev;
    }
    var attachments_ = ddoc._attachments;
    delete ddoc._attachments;
    // var attachments = [];
    ddoc._attachments = {}
    for (x in attachments_)  {
      // attachments.push([x, attachments_[x]])
      ddoc._attachments[x.slice(1)] = {data:attachments_[x].data.toString('base64'), 
                              content_type:attachments_[x].mime, 
                              getBody:attachments_[x]};
    };
    dbpath = url.parse(couchurl).pathname
    if (dbpath[dbpath.length - 1] != '/') {dbpath += '/'}
    
    if (ddoc._rev) {
      var method = 'PUT';
      couchurl = (couchurl[couchurl.length - 1] == '/') ? (couchurl + ddoc._id) : (couchurl + '/' + ddoc._id)
    } else {
      var method = 'POST'
    }
    sys.puts("Uploading...")
    var body = JSON.stringify(ddoc);
    var h = {'content-type':'application/json', 'content-length':body.length, connection:'keep-alive'}
    var client = request(couchurl, method, body, h, 0, 0, function (error, response, body){
      sys.puts('Finished Push.')
      if (response.statusCode == 201) {
        var names = []
          , rev = JSON.parse(body).rev
          ;
        for (x in ddoc._attachments) names.push(x);
        var pending = [];
        names.forEach(function (n) {
          fs.watchFile(ddoc._attachments[n].getBody.filename, function () {
            pending.push(n);
          })
        })
        function pushAttachments () {
          if (pending.length === 0) setTimeout(pushAttachments, 100);
          else {
            n = pending.shift();
            
            var a = ddoc._attachments[n];
            var body = fs.readFileSync(a.getBody.filename);
            
            body = body.toString();
            if (a.getBody.data.toString() === body) {
              return pushAttachments();
            }
            a.getBody.data = body;
            
            sys.puts("Updating "+ '/' + n + '?rev=' + rev)
            
            var h = {'content-type':a.content_type, 'content-length':body.length, connection:'keep-alive'}
            request(couchurl + '/' + n + '?rev=' + rev, 'PUT', body, h, client, 0, function (err, resp, body) {
              if (err) throw err;
              if (resp.statusCode !== 201) throw new Error('Could not updated attachemnt '+body);
              rev = JSON.parse(body).rev
              pushAttachments();
            })
          }
        }
        setTimeout(pushAttachments, 100)
      } else {
        sys.puts("Failed "+body)
      }
    })
  }
}

exports.sync = sync;
