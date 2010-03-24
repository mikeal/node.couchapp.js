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
  var request = client.request(method, uri.pathname, headers)
  
  request.addListener('error', function (error) {callback(error ? error : "requestError")})
    
  if (body) {
    request.write(body, encoding);
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
  request.close()
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
    var attachments = [];
    for (x in attachments_)  {attachments.push([x, attachments_[x]])};
    
    dbpath = url.parse(couchurl).pathname
    if (dbpath[dbpath.length - 1] != '/') {dbpath += '/'}
    
    if (ddoc._rev) {
      var method = 'PUT';
      couchurl = (couchurl[couchurl.length - 1] == '/') ? (couchurl + ddoc._id) : (couchurl + '/' + ddoc._id)
    } else {
      var method = 'POST'
    }

    request(couchurl, method, JSON.stringify(ddoc), undefined, undefined, undefined, function (error, response, body){
      if (response.statusCode == 201) {
        var uri = url.parse(couchurl)
        ddocpath = dbpath + ddoc._id
        function syncAttachments (rev, attachments, client) {
          if (attachments.length == 0) {
            if (callback) {
              callback(undefined, rev)
            }
            return;
          }
          attachment = attachments.shift();
          name = attachment[0]; getAttachment = attachment[1];
          getAttachment(function (error, stub, mime, length, getBody) {
            if (error) {
              callback(error)
            }
            getBody(function (error, body) {
              uri.pathname = (ddocpath + name + '?rev=' + rev );
              request(uri, "PUT", body, {'content-type':mime}, client, guessEncoding(undefined, mime), 
                function (error, response, body) {
                  var rev = JSON.parse(body)['rev'];
                  syncAttachments(rev, attachments, client);
              })
            })
          })
        }
        if (!uri.port) {uri.port = 80}
        syncAttachments(JSON.parse(body)['rev'], attachments, http.createClient(uri.port, uri.hostname))
      } else {
        callback("Could not create/update ddoc.\n"+sys.inspect(response)+'\n'+body);
      }
    })
  }
}

exports.sync = sync;
