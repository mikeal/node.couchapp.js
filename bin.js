#!/usr/bin/env node

var couchapp = require('./main.js')
    , watch = require('watch')
    , path = require('path')
    , fs = require('fs')
    ;

function abspath(pathname) {
    if (pathname[0] === '/') return pathname
    return path.join(process.cwd(), path.normalize(pathname));
}

function copytree(source, dest) {
    watch.walk(source, function (err, files) {
        for (i in files) {
            (function (i) {
                if (files[i].isDirectory()) {
                    try {
                        fs.mkdirSync(i.replace(source, dest), 0755)
                    } catch (e) {
                        console.log('Could not create ' + dest)
                    }
                } else {
                    fs.readFile(i, function (err, data) {
                        if (err) throw err;
                        fs.writeFile(i.replace(source, dest), data, function (err) {
                            if (err) throw err;
                        });
                    })
                }
            })(i);
        }
    })
}

function boiler(app) {
    if (app) {
        try {
            fs.mkdirSync(path.join(process.cwd(), app))
        }
        catch (e) {};
    }
    app = app || '.'

    copytree(path.join(__dirname, 'boiler'), path.join(process.cwd(), app));


}
function onBeforePushSync() {
    if (beforePushSyncListener && typeof beforePushSyncListener.onBeforePushSync === "function") {
        beforePushSyncListener.onBeforePushSync();
    }
}
function onAfterPushSync() {
    if (afterPushSyncListener && typeof afterPushSyncListener.onAfterPushSync === "function") {
        afterPushSyncListener.onAfterPushSync();
    }
}
function isUsingDirectoryConfig() {
    return process.argv[2].trim() === "-dc";
}
if (process.mainModule && process.mainModule.filename === __filename) {
    var node
        , bin
        , command
        , app
        , couch
        , configDirectory
        , configFileNames
        , apps = []
        , beforePushSyncListener
        , afterPushSyncListener
        ;
    //check for directory-based config, if so then read rather than shift() the arguments: will need to read them again later
    if (isUsingDirectoryConfig()) {
        node = process.argv[0];
        bin = process.argv[1];
        command = process.argv[3];
        configDirectory = process.argv[4];
        couch = process.argv[5];
        configFileNames = fs.readdirSync(configDirectory);
        if (configFileNames) {
            configFileNames.forEach(function (value, index) {
                //any files starting with "app" are included as app files e.g. app.js, app_number1.js etc.
                if (value.indexOf("app") == 0) {
                    apps.push(path.join(configDirectory, value));
                }
                //"before" listener must be called beforepushsync.js and be in the config directory
                else if (value.toLowerCase().trim() === "beforepushsync.js") {
                    beforePushSyncListener = require(abspath(path.join(configDirectory, "beforepushsync.js")));
                }
                //"after" listener must be called afterpushsync.js and be in the config directory
                else if (value.toLowerCase().trim() === "afterpushsync.js") {
                    afterPushSyncListener = require(abspath(path.join(configDirectory, "afterpushsync.js")));
                }
            });
        }
    }
    else {
        node = process.argv.shift();
        bin = process.argv.shift();
        command = process.argv.shift();
        app = process.argv.shift();
        couch = process.argv.shift();
    }

    if (command == 'help' || command == undefined) {
        console.log(
            [ "couchapp -- utility for creating couchapps"
                , ""
                , "Usage:"
                , "(backwardly compatible without switch - single app file)"
                , "  couchapp <command> app.js http://localhost:5984/dbname"
                , "(directory based config specified by switch - multiple app files and pre- and post-processing capability)"
                , " couchapp -dc <command> <appconfigdirectory> http://localhost:5984/dbname"
                , ""
                , "Commands:"
                , "  push   : Push app once to server."
                , "  sync   : Push app then watch local files for changes."
                , "  boiler : Create a boiler project."
            ]
                .join('\n')
        )
        process.exit();
    }

    if (isUsingDirectoryConfig()) {
        if (command == 'boiler') {
            for (i in apps) {
                boiler(apps[i]);
            }
        } else {
            onBeforePushSync();
            for (i in apps) {
                //an immediately executed function is used so the loop counter variable is available
                //in createApp's callback function: multiple calls to push/sync are supported and
                //onAfterPushSync is supplied as the callback function on the last call
                (function keepLoopCounter(i) {
                    couchapp.createApp(require(abspath(apps[i])), couch, function (app) {
                        if (command == 'push') {
                            app.push(i == apps.length - 1 ? onAfterPushSync : null);
                        }
                        else if (command == 'sync') {
                            app.sync(i == apps.length ? onAfterPushSync : null);
                        }
                    });
                })(i);
            }

        }
    }
    else {
        if (command == 'boiler') {
            boiler(app);
        } else {
            couchapp.createApp(require(abspath(app)), couch, function (app) {
                if (command == 'push') app.push()
                else if (command == 'sync') app.sync()

            })
        }
    }
}


exports.boilerDirectory = path.join(__dirname, 'boiler')

