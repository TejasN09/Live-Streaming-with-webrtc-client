const express = require('express');
const app = express();
let http = require('http').Server(app);
let minimist = require('minimist');
let io = require('socket.io')(http);
const kurento = require('kurento-client');
const path = require('path');

let kurentoClient = null;
let iceCandidateQueues = {};

let argv = minimist(process.argv.slice(2), {
    default: {
        //application server
        as_uri: 'http://localhost:3000',
        //web socket
        ws_uri: 'ws://localhost:8888/kurento'
    }
})


io.on('connection', socket => {
    console.log("socket client created!")
    socket.on('message', message => {
        console.log("line 24", message);
        switch (message.event) {
            case 'joinRoom':
                joinRoom(socket, message.userName, message.roomName, message.role, err => {
                    if (err) {
                        console.log(err);
                    }
                });
                break;
            case 'receiveVideoFrom':

                receiveVideoFrom(socket, message.userid, message.roomName, message.sdpOffer, err => {
                    if (err) {
                        console.log(err);
                    }
                })
                break;
            case 'candidate':
               
                addIceCandidate(socket, message.userid, message.roomName, message.candidate, err => {
                    if (err) {
                        console.log(err);
                    }
                })
                break;
        }
    })
})


function joinRoom(socket, username, roomname, role, callback) {
    console.log("joinRoomHandler");
    console.log("Role: ", role)
    getRoom(socket, roomname, async (err, myRoom) => {
        if (err) {
            console.log("joinRoom():", err);
            return callback(err);
        }

        try {
            let outgoingMedia = await myRoom.pipeline.create('WebRtcEndpoint');
            let user = {
                id: socket.id,
                name: username,
                role: role,
                outgoingMedia: outgoingMedia,
                incomingMedia: {},
                filter: null,
            }
            if (role === 'member') {
                user.filter = await myRoom.pipeline.create('GStreamerFilter', {
                    command: 'videoflip method=vertical-flip'
                });
                user.outgoingMedia.connect(user.filter);
                // filter.connect(user.outgoingMedia);
            }
            console.log("72");
            let icecandidateQueue = iceCandidateQueues[user.id];

            if (icecandidateQueue) {
                while (icecandidateQueue.length) {
                    let ice = icecandidateQueue.shift();
                    user.outgoingMedia.addIceCandidate(ice.candidate);
                }
            }

            user.outgoingMedia.on('IceCandidateFound', event => {

                if (event.candidate) {
                    // let candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                    socket.emit('message', {
                        event: 'candidate',
                        userid: user.id,
                        candidate: event.candidate
                    })
                }

            })
            console.log("91");

            socket.to(roomname).emit('message', {
                event: 'newParticipantArrived',
                userid: user.id,
                username: user.name,
                role: user.role,
            })

            let existingUsers = [];
            // console.log("participants: ", myRoom.participants);
            for (let i in myRoom.participants) {
                if (myRoom.participants[i].id !== user.id && myRoom.participants[i].role === 'member') {
                    existingUsers.push({
                        id: myRoom.participants[i].id,
                        name: myRoom.participants[i].name
                    })
                }
            }

            socket.emit('message', {
                event: 'existingParticipants',
                existingUsers,
                userid: user.id,
                role: user.role
            })

            myRoom.participants[user.id] = user;
        } catch (err) {
            console.log("Error occured while creating WebRtcEndpoint")
            return callback(err);
        }

    })
}

async function getKurentoClient(callback) {
    if (kurentoClient !== null)
        return null;
    try {
        kurentoClient = await kurento(argv.ws_uri);
        return null;
    } catch (error) {
        console.log("Error Occured while creating Kurento Client");
        return error;
    }
}

async function getRoom(socket, roomname, callback) {
    let myRoom = io.sockets.adapter.rooms.get(roomname) || { length: 0 };

    let numClients = myRoom.length;

    if (numClients === 0) {
        console.log("141");

        console.log("//creates room for 1st user")
        socket.join(roomname);
        myRoom = io.sockets.adapter.rooms.get(roomname);
        // console.log(myRoom);

        try {
            let err = await getKurentoClient();

            if (err) {
                console.log(err);
            } else {
                myRoom.pipeline = await kurentoClient.create('MediaPipeline');
                myRoom.participants = {};

                callback(null, myRoom);
            }

        } catch (err) {
            console.log("error occured");
            console.log(err);
        }

    } else {
        socket.join(roomname);
        callback(null, myRoom);
    }
}

async function getEndpointForUser(socket, roomname, senderid, callback) {
    let myRoom = io.sockets.adapter.rooms.get(roomname);
    // console.log("roomName", roomname, "myRoom", myRoom)
    let asker = myRoom.participants[socket.id];
    let sender = myRoom.participants[senderid];

    
    if (asker.id === sender.id) {
        return callback(null, asker.outgoingMedia);
    }
    // if(asker.role === 'viewer') return callback(null, null);

    if (asker.incomingMedia[sender.id]) {
        sender.outgoingMedia.connect(asker.incomingMedia[sender.id], err => {
            if (err) return callback(err)
            callback(null, asker.incomingMedia[sender.id])

        });
    } else {

        try{
            let incomingMedia = await myRoom.pipeline.create('WebRtcEndpoint');
            asker.incomingMedia[sender.id] = incomingMedia;

            let icecandidateQueue = iceCandidateQueues[sender.id];

            if (icecandidateQueue) {
                while (icecandidateQueue.length) {
                    let ice = icecandidateQueue.shift();
                    incomingMedia.addIceCandidate(ice.candidate);
                }
            }

            incomingMedia.on('IceCandidateFound', event => {
                if(event.candidate){
                    //due
                    // let candidate = kurento.register.complexTypes.IceCandidates(event.candidate);
                    socket.emit('message', {
                        event: 'candidate',
                        userid: sender.id,
                        candidate: event.candidate
                    })    
                }
                
            })

            if(asker.role === 'viewer')
                sender.filter.connect(incomingMedia);
            else
                sender.outgoingMedia.connect(incomingMedia);

            return callback(null, incomingMedia);

        }catch(e){
            console.log("Error occured while creating incoming media client.")
            return callback(e);
        }
    
    }
}

function receiveVideoFrom(socket, userid, roomName, sdpOffer, callback) {
    getEndpointForUser(socket, roomName, userid, async (err, endpoint) => {
        if (err) return callback(err);
        console.log("sdpOffStart");
        // console.log(sdpOffer);
        console.log("sdpOffEND");

        try {
            const answerSdp = await endpoint.processOffer(sdpOffer);

            socket.emit('message', {
                event: "receiveVideoAnswer",
                senderid: userid,
                sdpAnswer: answerSdp
            });

            endpoint.gatherCandidates(err => {
                if (err) return callback(err);
            })


        } catch (err) {
            console.log("Error Occured while processing offer", err);
            return callback(err)
        }
    })
}

function addIceCandidate(socket, senderid, roomName, iceCandidate, callback) {
    let myRoom = io.sockets.adapter.rooms.get(roomName)
    console.log("MyRoom312: ", roomName);
    let user = myRoom ? myRoom.participants[socket.id] : null;
    if (user != null) {
        let candidate = kurento.register.complexTypes.IceCandidate(iceCandidate);
        if (senderid === user.id) {
            if (user.outgoingMedia) {
                user.outgoingMedia.addIceCandidate(candidate);

            } else {
                iceCandidateQueues[user.id].push({ candidate: candidate });
            }
        } else {
            if (user.incomingMedia[senderid]) {
                user.incomingMedia[senderid].addIceCandidate(candidate);
            } else {
                if (!iceCandidateQueues[senderid]) {
                    iceCandidateQueues[senderid] = [];
                }

                iceCandidateQueues[senderid].push({ candidate: candidate })
            }
        }

        callback(null);
    } else {
        callback(new Error("addIceCandidate failed"));
    }
}


// app.use(express.static('public'));
app.use('/', express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landingPage.html'));
});

app.get('/roomId=:roomId', (req, res) => {
    const roomId = req.params.roomId;
    console.log(path.join(__dirname, 'public','index.html'),roomId)
    res.sendFile(path.join(__dirname, 'public','index.html'));
});

http.listen(3000, () => {
    console.log('App is running');
})