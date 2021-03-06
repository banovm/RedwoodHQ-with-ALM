var http = require("http");
var net = require('net');
var fs = require('fs');
var path = require('path');
var walk = require('walk');
var launcherProc = {};
var spawn = require('child_process').spawn;
var launcherConn = {};
var common = require('../common');
var basePort = 4445;
var basePythonPort = 6445;
var baseCSharpPort = 8445;
var baseExecutionDir = path.resolve(__dirname,"../executionfiles");
var actionCache = {};

exports.Post = function(req, res){
    var command = req.body;
    common.logger.info(command);
    if(command.command == "run action"){
        common.logger.info("running action");
        //console.log(command);
        var portNumber;
        var type;
        command.matchID = common.uniqueId();
        if(!command.scriptLang) command.scriptLang = "Java/Groovy";
        if(command.scriptLang == "Java/Groovy"){
            actionCache[basePort+command.threadID] = command;
            portNumber = basePort+command.threadID;
            type = "java"
        }
        else if(command.scriptLang == "Python"){
            actionCache[basePythonPort+command.threadID] = command;
            portNumber = basePythonPort+command.threadID;
            type = "python"
        }
        else if(command.scriptLang == "C#"){
            actionCache[baseCSharpPort+command.threadID] = command;
            portNumber = baseCSharpPort+command.threadID;
            type = "csharp"
        }
        if(!launcherConn[command.executionID+portNumber.toString()]){
            startLauncher(command.executionID,command.threadID,type,function(){
                sendLauncherCommand(command,null,function(err){
                    res.send(JSON.stringify({"error":err,"success":true}));
                });
            })
        }
        else{
            sendLauncherCommand(command,null,function(err){
                res.send(JSON.stringify({"error":err,"success":true}));
            });
        }
    }
    else if(command.command == "cleanup"){
        common.logger.info("cleaning up");
        setTimeout(function(){
            //cleanUpOldExecutions(command.executionID);
        },1*60*1000);
        var count = 0;
        var cleanUpDirs = function(){
            deleteDir(baseExecutionDir + "/"+command.executionID,function(){
            });
            res.send('{"error":null,"success":true}');
        };

        if (Object.keys(launcherConn).length != 0){
            var toDelete = [];
            for(var propt in launcherConn){
                count++;
                if(propt.toString().indexOf(command.executionID) != -1){
                    toDelete.push(propt);
                    stopLauncher(command.executionID,parseInt(propt.substr(propt.length - 4)),function(){
                        //cleanUpDirs()
                    });
                }
                if(count == Object.keys(launcherConn).length){
                    toDelete.forEach(function(conn){
                        console.log("should delete:"+conn);
                        delete launcherConn[conn];

                    });
                    //cleanUpDirs()
                }
            }
        }
        else{
            //cleanUpDirs();
        }
    }
    else if (command.command == "start launcher"){
        res.send(JSON.stringify({"error":null}));
        return;
        common.logger.info("starting launcher: ThreadID: "+command.threadID);
        startLauncher(command.executionID,command.threadID,"java",function(err){
            if(err){
                res.send(JSON.stringify({"error":err}));
                return
            }
            startLauncher(command.executionID,command.threadID,"python",function(err){
                res.send(JSON.stringify({"error":err}));
            });
        });
    }
    else if (command.command == "files loaded"){
        //fs.exists(baseExecutionDir+"/"+command.executionID+"/launcher/RedwoodHQLauncher.jar",function(exists){
		fs.exists(baseExecutionDir+"/launcher/RedwoodHQLauncher.jar",function(exists){
            res.send(JSON.stringify({"loaded":exists}));
        })
    }
};


function startLauncher_debug(callback){
            launcherConn = net.connect(basePort, function(){
                callback(null);
                var cache = "";
                launcherConn.on('data', function(data) {
                    cache += data.toString();

                    common.logger.info('data:', data.toString());
                    if (cache.indexOf("--EOM--") != -1){
                        var msg = JSON.parse(cache.substring(0,cache.length - 7));
                        if (msg.command == "action finished"){
                            sendActionResult(msg);
                        }
                        cache = "";
                    }
                });

                launcherConn.on('error', function(err) {
                    callback(err);
                });
            });
}

function checkForDupLauncher(){

}


function startLauncher(executionID,threadID,type,callback){
	//var libPath = baseExecutionDir+"/"+executionID+"/lib/";
	var libPath = baseExecutionDir+"/lib/";
    //var launcherPath  = baseExecutionDir+"/"+executionID+"/launcher/";
	var launcherPath  = baseExecutionDir+"/launcher/";
    var javaPath = "";
    var portNumber;
    if(type == "java"){
        portNumber = basePort + threadID;
    }
    else if(type == "python"){
        portNumber = basePythonPort + threadID;
    }
    else if(type == "csharp"){
        portNumber = baseCSharpPort + threadID;
    }
    var classPath = "";

    //check if there is a process with same port already running
    var foundConn = null;
    for(var propt in launcherConn){
        if (propt.indexOf(portNumber.toString(), propt.length - portNumber.toString().length) !== -1){
            foundConn = launcherConn[propt];
        }
    }

    var startProcess = function(){
        /*if (fs.existsSync(baseExecutionDir+"/"+executionID+"/bin") == false){
            fs.mkdirSync(baseExecutionDir+"/"+executionID+"/bin");
        }*/
		if (fs.existsSync(baseExecutionDir+"/bin") == false){
            fs.mkdirSync(baseExecutionDir+"/bin");
        }
        var pathDivider = ";";
        if(require('os').platform() == "linux" || (require('os').platform() == "darwin")) {
            pathDivider = ":"
        }
        if(type == "java"){
            javaPath = path.resolve(__dirname,"../../vendor/Java/bin")+"/java";
			common.logger.info("javapath: " + javaPath);
            classPath = libPath+'*'+pathDivider+launcherPath+'*';
			common.logger.info("classPath: " + classPath);
            /*
            if(require('os').platform() == "linux"){
                javaPath = path.resolve(__dirname,"../../vendor/Java/bin")+"/java";
                classPath = libPath+'*:'+launcherPath+'*';
            }
            if(require('os').platform() == "darwin"){
                javaPath = path.resolve(__dirname,"../../vendor/Java/bin")+"/java";
                classPath = libPath+'*:'+launcherPath+'*';
            }
            else{
                javaPath = path.resolve(__dirname,"../../vendor/Java/bin")+"/java";
                classPath = libPath+'*;'+launcherPath+'*';
            }
            */
			common.logger.info("inside startLauncher 1");
            //launcherProc[executionID+portNumber.toString()] = spawn(javaPath,["-cp",classPath,"-Xmx512m","-Dfile.encoding=UTF8","redwood.launcher.Launcher",portNumber.toString()],{env:{PATH:baseExecutionDir+"/"+executionID+"/bin/:/usr/local/bin:/bin:/sbin:/usr/bin:/usr/sbin"},cwd:baseExecutionDir+"/"+executionID+"/bin/"});
			launcherProc[executionID+portNumber.toString()] = spawn(javaPath,["-cp",classPath,"-Xmx512m","-Dfile.encoding=UTF8","redwood.launcher.Launcher",portNumber.toString()],{env:{PATH:baseExecutionDir+"/bin/:/usr/local/bin:/bin:/sbin:/usr/bin:/usr/sbin"},cwd:baseExecutionDir+"/bin/"});
			common.logger.info("inside startLauncher 2");
        }
        else if(type == "python"){
            var pythonPath = baseExecutionDir+"/"+executionID+"/python";
            var pythonLauncherPath = path.resolve(__dirname,"../lib")+"/pythonLauncher.py";
            //launcherProc[executionID+portNumber.toString()] = spawn(pythonPath,[pythonLauncherPath,portNumber.toString()],{env:{PYTHONPATH:baseExecutionDir+"/"+executionID+"/src/"},cwd:baseExecutionDir+"/"+executionID+"/bin/"});
            launcherProc[executionID+portNumber.toString()] = spawn(pythonPath,[pythonLauncherPath,portNumber.toString()],{env:{PYTHONPATH:path.resolve(__dirname,"../../vendor/Python/DLLs")+pathDivider+path.resolve(__dirname,"../../vendor/Python/Lib")+pathDivider+baseExecutionDir+"/"+executionID+"/src/"},cwd:baseExecutionDir+"/"+executionID+"/bin/"});
        }
        else if(type == "csharp"){
            var csharpLauncherPath = baseExecutionDir+"/"+executionID+"/lib/CSharpLauncher.exe";
            launcherProc[executionID+portNumber.toString()] = spawn(csharpLauncherPath,[portNumber.toString(),baseExecutionDir+"/"+executionID+"/lib/RedwoodHQAutomation.dll"],{cwd:baseExecutionDir+"/"+executionID+"/bin/"});
        }
        //launcherProc[executionID+portNumber.toString()] = require('child_process').execFile(javaPath+ " -cp " + classPath + " -Xmx512m "+"redwood.launcher.Launcher "+portNumber.toString(),{env:{PATH:baseExecutionDir+"/"+executionID+"/bin/"},cwd:baseExecutionDir+"/"+executionID+"/bin/"});
        //fs.writeFileSync(baseExecutionDir+"/"+executionID+"/"+threadID+type+"_launcher.pid",launcherProc[executionID+portNumber.toString()].pid);
		fs.writeFileSync(baseExecutionDir+"/"+threadID+type+"_launcher.pid",launcherProc[executionID+portNumber.toString()].pid);
        launcherProc[executionID+portNumber.toString()].stderr.on('data', function (data) {
            sendLog({message:"STDOUT ERROR: " + data.toString(),date:new Date(),actionName:actionCache[portNumber].name,resultID:actionCache[portNumber].resultID,executionID:executionID},common.Config.AppServerIPHost,common.Config.AppServerPort);
            if(data.toString().indexOf("WARNING") != -1) return;
            if(data.toString().indexOf("JavaScript error") != -1) return;
            common.logger.error("launcher error:"+data.toString());
            if (actionCache[portNumber]){
                launcherProc[executionID+portNumber.toString()] = null;
                //org.jclouds.logging.jdk.JDKLogger
                if(data.toString().indexOf("org.jclouds.logging.jdk.JDKLogger") != -1 && data.toString().indexOf("SEVERE") != -1){
                    //actionCache[portNumber].error = data.toString();
                    //actionCache[portNumber].result = "Failed";
                    //sendActionResult(actionCache[portNumber],common.Config.AppServerIPHost,common.Config.AppServerPort);
                    //delete actionCache[portNumber];
                }
            }

            //callback(data.toString());
        });
        common.logger.info("starting port:"+portNumber);
        //var launcherRetry = 1;
        var checkForCrush = function(portNumber){
            if (actionCache[portNumber]){
                actionCache[portNumber].error = "Launcher crashed";
                actionCache[portNumber].result = "Failed";
                sendActionResult(actionCache[portNumber],common.Config.AppServerIPHost,common.Config.AppServerPort);
                delete actionCache[portNumber];
            }
        };
        launcherProc[executionID+portNumber.toString()].on('close', function (data) {
            if(launcherProc[executionID+portNumber.toString()]){
                delete launcherProc[executionID+portNumber.toString()];
                setTimeout(checkForCrush(portNumber),1000);
            }
            callback(data.toString());
        });
		common.logger.info("inside startLauncher 3");
        var cmdCache = "";
        launcherProc[executionID+portNumber.toString()].stdout.on('data', function (data) {
            common.logger.info("inside startLauncher 4");
			cmdCache += data.toString();
            common.logger.info('stdout: ' + data.toString());
            if (data.toString().indexOf("launcher running.") != -1){
                cmdCache = "";
                launcherConn[executionID+portNumber.toString()] = net.connect(portNumber, function(){
                    callback(null);
                    var cache = "";
                    launcherConn[executionID+portNumber.toString()].on('data', function(tcpData) {
                        cache += tcpData.toString();

                        common.logger.info('data:', tcpData.toString());
                        if (cache.indexOf("--EOM--") != -1){

                            //var msg = JSON.parse(cache.substring(0,cache.length - 7));
                            var msg = JSON.parse(cache.substring(0,cache.indexOf("--EOM--")));
                            if (msg.command == "action finished"){
                                if(msg.matchID != actionCache[portNumber].matchID){
                                    cache = "";
                                    return;
                                }
                                delete actionCache[portNumber];
                                if(msg.screenshot){
                                    common.sendFileToServer(baseExecutionDir+"/"+executionID + "/bin/" + msg.screenshot,msg.screenshot,"/screenshots",common.Config.AppServerIPHost,common.Config.AppServerPort,"executionID="+executionID+";resultID="+msg.resultID,function(){
                                        sendActionResult(msg,common.Config.AppServerIPHost,common.Config.AppServerPort);
                                    })
                                }
                                else{
                                    sendActionResult(msg,common.Config.AppServerIPHost,common.Config.AppServerPort);
                                }
                                cache = "";
                            }
                            if (msg.command == "Log Message"){
                                //if()
                                msg.date=new Date();
                                sendLog(msg,common.Config.AppServerIPHost,common.Config.AppServerPort);
                            }
                            cache = cache.substring(cache.indexOf("--EOM--") + 7,cache.length);
                        }
                    });
                });

                launcherConn[executionID+portNumber.toString()].on('error', function(err) {
                    common.logger.error("Error connecting to launcher on port "+portNumber+": "+err);
                    //sendActionResult(msg,common.Config.AppServerIPHost,common.Config.AppServerPort);
                    //checkForCrush(portNumber);
                    callback("Error connecting to launcher on port "+portNumber+": "+err);
                });
            }
            else{
                if (cmdCache.indexOf("\n") != -1){
                    if (cmdCache.length <= 2) {
                        cmdCache = "";
                        return;
                    }

                    cmdCache.split("\r\n").forEach(function(message,index,array){
                        if(index == array.length - 1){
                            if (cmdCache.lastIndexOf("\r\n")+2 !== cmdCache.length){
                                cmdCache = cmdCache.substring(cmdCache.lastIndexOf("\r\n") + 2,cmdCache.length);
                            }else{
                                if (message != ""){
                                    common.logger.info("sending:"+message);
                                    sendLog({executionID:executionID,message:message,date:new Date(),actionName:actionCache[portNumber].name,resultID:actionCache[portNumber].resultID},common.Config.AppServerIPHost,common.Config.AppServerPort);
                                }
                                cmdCache = "";
                            }
                        }
                        if (message != ""){
                            common.logger.info("sending:"+message);
                            if(actionCache[portNumber]){
                                sendLog({message:message,date:new Date(),actionName:actionCache[portNumber].name,executionID:executionID,runType:actionCache[portNumber].runType,resultID:actionCache[portNumber].resultID,username:actionCache[portNumber].username},common.Config.AppServerIPHost,common.Config.AppServerPort);
                            }
                        }
                    });
                }
            }
        });
    };

    if (foundConn != null){
        stopLauncher(executionID,basePort + threadID,function(){
            stopLauncher(executionID,basePythonPort + threadID,function(){
                stopLauncher(executionID,baseCSharpPort + threadID,function(){
                    startProcess();
                });
            });
        });
    }
    else{
        try{
            foundConn = net.connect(portNumber, function(){
                foundConn.write(JSON.stringify({command:"exit"})+"\r\n",function(){
                    setTimeout(startProcess(),5000);
                });
            });
            foundConn.on("error",function(err){
                //common.logger.error(err);
                startProcess();
            })
        }
        catch(err){
            startProcess();
        }
    }
}

function stopLauncher(executionID,port,callback){
    if (launcherProc[executionID+port.toString()] != null){
        sendLauncherCommand({command:"exit",executionID:executionID},port,function(){
            try{
                process.kill(launcherProc[executionID+port.toString()].pid);
            }
            catch(exception){
                common.logger.error(exception);
            }
            delete launcherProc[executionID+port.toString()];
        });
    }
    //if there is runaway launcher try to kill it
    else{
        var conn;
        conn = net.connect(port, function(){
            conn.write(JSON.stringify({command:"exit"})+"\r\n");
        }).on('error', function(err) {
                //deleteDir(baseExecutionDir+"/"+executionID+"/launcher/",callback)
        });
    }


    if (fs.existsSync(baseExecutionDir+"/"+executionID+"/"+port.toString()+"java_launcher.pid") == true){
        var jpid = fs.readFileSync(baseExecutionDir+"/"+executionID+"/"+port.toString+"java_launcher.pid").toString();
        try{
            process.kill(jpid,"SIGTERM");
        }
        catch(err){}
    }
    if (fs.existsSync(baseExecutionDir+"/"+executionID+"/"+port.toString()+"python_launcher.pid") == true){
        var ppid = fs.readFileSync(baseExecutionDir+"/"+executionID+"/"+port.toString()+"python_launcher.pid").toString();
        try{
            process.kill(ppid,"SIGTERM");
        }
        catch(err){}
    }
    if (fs.existsSync(baseExecutionDir+"/"+executionID+"/"+port.toString()+"csharp_launcher.pid") == true){
        var ppid = fs.readFileSync(baseExecutionDir+"/"+executionID+"/"+port.toString()+"csharp_launcher.pid").toString();
        try{
            process.kill(ppid,"SIGTERM");
        }
        catch(err){}
    }
    delete launcherConn[port];
    setTimeout(function() { callback();}, 4000);

}

exports.cleanUp = function(){
    cleanUpOldExecutions();
};

function cleanUpOldExecutions(ignoreExecution){

    fs.readdir(baseExecutionDir,function(err,list){
        if (!list) return;
        list.forEach(function(dir){
            if((ignoreExecution)&&(ignoreExecution == dir)) return;
            getExecutionStatus(common.Config.AppServerIPHost,common.Config.AppServerPort,dir,function(result){
                if((result.execution == null) || (result.execution.status == "Ready To Run")){
                    fs.readdir(baseExecutionDir+"/"+dir,function(err,list){
                        var dirs = [];
                        if (list){
                            list.forEach(function(file,index){
                                try{
                                    if (file.indexOf(".pid") != -1){
                                        var pid = fs.readFileSync(baseExecutionDir+"/"+dir+"/launcher/"+file).toString();
                                        process.kill(pid,"SIGTERM");
                                        fs.unlink(baseExecutionDir+"/"+dir+"/launcher/"+file);
                                    }
                                }
                                catch(err){}
                                if(index+1 == list.length){
                                    dirs.push(baseExecutionDir+"/"+dir);
                                }
                            });
                            dirs.forEach(function(dirCount){
                                deleteDir(dirCount)
                            });
                        }
                    });
                }
                common.logger.info(result)
            })
        });
    });
}

function deleteDir(dir,callback){
    var walker = walk.walkSync(dir);

    var allDirs = [];
    walker.on("file", function (root, fileStats, next) {
        fs.unlinkSync(root+"/"+fileStats.name);
    });

    walker.on("directories", function (root, dirs, next) {
        dirs.forEach(function(dir){
            allDirs.push(root+"/"+dir.name);
        });
        next();
    });
    walker.on("end", function () {
        //res.send("{error:null,success:true}");
        allDirs.reverse();
        allDirs.forEach(function(dirCount){
            try{
                fs.rmdirSync(dirCount);
            }
            catch(err){
                common.logger.info("dir "+ dirCount +" is not empty")
            }

            common.logger.info(dirCount);
        });
        try{
            fs.rmdirSync(dir);
        }
        catch(err){
            common.logger.info("dir "+ dir +" is not empty")
        }

        if(callback) callback();
    });

}

function sendLauncherCommand(command,port,callback){
    var portNumber;
    if(command.scriptLang == "Java/Groovy"){
        portNumber = basePort+command.threadID;
    }
    else if(command.scriptLang == "Python"){
        portNumber = basePythonPort+command.threadID;
    }
    else if(command.scriptLang == "C#"){
        portNumber = baseCSharpPort+command.threadID;
    }
    if(port != null) portNumber = port;

    common.logger.info("sending command: "+ JSON.stringify(command));
    if (launcherConn[command.executionID+portNumber.toString()] == null){
        common.logger.error("unable to connect to launcher");
        callback("unable to connect to launcher");
        return;
    }
    launcherConn[command.executionID+portNumber.toString()].write(JSON.stringify(command)+"\r\n");
    callback(null);
}


function sendActionResult(result,host,port){
    var path = "/executionengine/actionresult";
    if(result.runType == "unittest"){
        path = "/rununittest/result"
    }
    var options = {
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        agent:false,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            common.logger.info('sendActionResult result: ' + chunk);
        });
    });

    //req.setTimeout( 5*60*1000, function( ) {
        // handle timeout here
    //});

    req.on('error', function(e) {
        common.logger.error('problem with sendActionResult request: ' + e.message);
        setTimeout(function(){sendActionResult(result,host,port);},10000);
    });

    // write data to request body
    req.write(JSON.stringify(result));
    req.end();
}

function sendLog(result,host,port){
    var path = '/executionengine/logmessage';
    if(result.runType == "unittest"){
        path = "/rununittest/log"
    }
    var options = {
        hostname: host,
        port: port,
        path: path,
        method: 'POST',
        agent:false,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            common.logger.info('sendLog result: ' + chunk);
        });
    });

    req.on('error', function(e) {
        common.logger.error('problem with sendLog request: ' + e.message);
        setTimeout(function(){sendLog(result,host,port);},10000);
    });

    // write data to request body
    req.write(JSON.stringify(result));
    req.end();
}

function getExecutionStatus(host,port,executionID,callback){
    var options = {
        hostname: host,
        port: port,
        path: '/executionstatus/'+executionID,
        method: 'GET',
        agent:false,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            common.logger.info('getExecutionStatus result: ' + chunk.toString());
            try{
                callback(JSON.parse(chunk));
            }
            catch(error){callback({execution:null})}
        });
    });

    req.on('error', function(e) {
        common.logger.error('problem with request: ' + e.message);
        setTimeout(function(){getExecutionStatus(result,host,port);},10000);
    });

    req.end();
}

