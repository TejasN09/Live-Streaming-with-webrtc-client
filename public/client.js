// import kurento from "kurento-client";

const select = (id) => {return document.getElementById(id)};

let divRoomSelection = select('roomSelection');
let divMeetingRoom = select('meetingRoom');
// let inputRoom = select('room');
let userType = select('userType')
let inputName = select('name');
let btnRegister = select('enterRoom');

// variables
let inputRole = userType.value;

let userName, participants = {};

let socket = io();

btnRegister.onclick = () => {
    console.log("hii")
    let role = inputRole;
    console.log("Role: ", role);
    if(role === 'viewer'){
        return;
    }
    console.log(roomName);
    // roomName = inputRoom.value;
    userName = inputName.value;
    console.log('inside btn')
    if(roomName === '' || userName === ''){
        alert('Room and Name are required')
    }else {
        let message = {
            event: 'joinRoom',
            userName: userName,
            roomName: roomName,
            role: 'member',
        }

        sendMessage(message);

        divRoomSelection.style = "display: none";
        divMeetingRoom.style = "display: block";
    }
}

socket.on('message', message => {
    console.log('Message arrived', message.event);

    switch(message.event){
        case 'newParticipantArrived':
            receiveVideo(message.userid, message.username, message.role);
            break;
        case 'existingParticipants': 
            console.log("ExistingUsers: ", message.existingUsers);
            onExistingParticipants(message.userid, message.existingUsers, message.role)
            break;
        case 'receiveVideoAnswer':
            onReceiveVideoAnswer(message.senderid, message.sdpAnswer);
            break;
        case 'candidate':
            addIceCandidate(message.userid, message.candidate);
            break;

    }
})

function sendMessage(message){
    socket.emit('message', message);
}

function sendMessage(message) {
    socket.emit('message', message);
}

function receiveVideo(userid, username, role){
    if(role === 'viewer') return;
    let video = document.createElement('video');
    let div = document.createElement('div');
    div.className = 'videoContainer';
    let name = document.createElement('div');
    video.id = userid;
    video.autoplay = true;
    name.appendChild(document.createTextNode(username));
    div.appendChild(video);
    div.appendChild(name);
    divMeetingRoom.appendChild(div);

    let user = {
        id: userid,
        username: username,
        video: video,
        rtcPeer: null
    };

    participants[user.id] = user;

    let options = {
        remoteVideo: video,
        onicecandidate: onIceCandidate
    }

    user.rtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, err => {
        if(err){
            console.error("while creating rtc Peer",err)
        }

        user.rtcPeer.generateOffer(onOffer);

    })

    function onOffer(err, offer, wp){
        let message = {
            event: 'receiveVideoFrom',
            userid: user.id,
            roomName: roomName,
            sdpOffer: offer
        };

        sendMessage(message);
    }

    function onIceCandidate(candidate, wp){
        console.log('112');
        let message = {
            event: 'candidate',
            userid: user.id,
            roomName: roomName,
            candidate: candidate
        }

        sendMessage(message);
    }
}


function onExistingParticipants(userid, existingUsers, role){
    console.log("line 133 role: ", role)
    let video = document.createElement('video');
    let div = document.createElement('div');
    div.className = 'videoContainer';
    let name = document.createElement('div');
    video.id = userid;
    video.autoplay = true;
    name.appendChild(document.createTextNode(userName));
    div.appendChild(video);
    div.appendChild(name);
    if(role === 'member')
        divMeetingRoom.appendChild(div);

    let user = {
        id: userid,
        username: userName,
        video: video,
        rtcPeer: null,
        role: role,
    };

    participants[user.id] = user;

    if(role === 'member'){
        console.log("INside member only syntax")
        let constraints = {
            audio: true,
            video: {
                mandatory: {
                    maxWidth: 320,
                    maxFrameRate: 15, 
                    minFrameRate: 15
                }
            }
        }
        let options = {
            localVideo: video,
            onicecandidate: onIceCandidate,
            mediaConstraints: constraints,
        }
        // options.localVideo = video;
        // options.mediaConstraints = constraints;
        user.rtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, err => {
            if(err){
                console.error(err)
                return
            }
    
            user.rtcPeer.generateOffer(onOffer);
        })
    }else{
        //No need to set local video and mediaConstraints
    }

    

    existingUsers.forEach(element => {
        receiveVideo(element.id, element.name)
    })
    
    function onOffer(err, offer, wp){
        console.log("OnOffer function called")
        if(err) console.log("onOffer", err);
        let message = {
            event: 'receiveVideoFrom',
            userid: user.id,
            roomName: roomName,
            sdpOffer: offer
        };

        sendMessage(message);
    }

    function onIceCandidate(candidate, wp){
        console.log('187', roomName)
        let message = {
            event: 'candidate',
            userid: user.id,
            roomName: roomName,
            candidate: candidate
        }

        sendMessage(message);
    }
}


function onReceiveVideoAnswer(senderid, sdpAnswer) {
    console.log("senderid: ", senderid)
    console.log('sdpAnswer', sdpAnswer)
    participants[senderid].rtcPeer.processAnswer(sdpAnswer);
}


function addIceCandidate(userid, candidate) {
    participants[userid].rtcPeer.addIceCandidate(candidate);
}