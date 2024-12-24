import { nowInSec, SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } from "@skyway-sdk/room";

const token = new SkyWayAuthToken({
    jti: uuidV4(),
    iat: nowInSec(),
    exp: nowInSec() + 60 * 60 * 24,
    scope: {
        app: {
            id: process.env.SKYWAY_API_KEY,
            turn: true,
            actions: ["read"],
            channels: [{
                id: "*",
                name: "*",
                actions: ["write"],
                members: [{
                    id: "*",
                    name: "*",
                    actions: ["write"],
                    publication: {
                        actions: ["write"],
                    },
                    subscription: {
                        actions: ["write"],
                    },
                }, ],
                sfuBots: [{
                    actions: ["write"],
                    forwardings: [{
                        actions: ["write"],
                    }, ],
                }, ],
            }, ],
        },
    },
}).encode(process.env.SKYWAY_SECRE);
(async() => {
    const localVideo = document.getElementById("local-video");
    const buttonArea = document.getElementById("button-area");
    const remoteMediaArea = document.getElementById("remote-media-area");
    const roomNameInput = document.getElementById("room-name");
    const myId = document.getElementById("my-id");
    const joinButton = document.getElementById("join");
    const leaveButton = document.getElementById("leave");

    let selectedAudioId = null;
    let selectedVideoId = null;

    // 利用可能なデバイスを取得
    const getDevices = async() => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === "videoinput");
        const audioDevices = devices.filter((device) => device.kind === "audioinput");

        if (videoDevices.length > 0) {
            selectedVideoId = videoDevices[0].deviceId; // デフォルトで最初のカメラを選択
        }

        if (audioDevices.length > 0) {
            selectedAudioId = audioDevices[0].deviceId; // デフォルトで最初のマイクを選択
        }

        console.log("Video Devices:", videoDevices);
        console.log("Audio Devices:", audioDevices);
    };

    await getDevices();

    const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream({
        audio: { deviceId: { ideal: selectedAudioId } }, // 柔軟なデバイス指定
        video: { deviceId: { ideal: selectedVideoId }, width: 1280, height: 720 },
    });

    video.attach(localVideo);
    await localVideo.play();

    joinButton.onclick = async() => {
        if (roomNameInput.value === "") return;

        const context = await SkyWayContext.Create(token);
        const room = await SkyWayRoom.FindOrCreate(context, {
            type: "sfu",
            name: roomNameInput.value,
        });
        const me = await room.join();

        myId.textContent = me.id;

        await me.publish(audio);
        await me.publish(video);

        const subscribeAndAttach = (publication) => {
            if (publication.publisher.id === me.id) return;

            const subscribeButton = document.createElement("button");
            subscribeButton.id = `subscribe-button-${publication.id}`;
            subscribeButton.textContent = `${publication.publisher.id}: ${publication.contentType}`;
            buttonArea.appendChild(subscribeButton);

            subscribeButton.onclick = async() => {
                const { stream } = await me.subscribe(publication.id);

                let newMedia;
                switch (stream.track.kind) {
                    case "video":
                        newMedia = document.createElement("video");
                        newMedia.playsInline = true;
                        newMedia.autoplay = true;
                        newMedia.style.width = "300px"; // 必要に応じて変更
                        newMedia.style.height = "auto";
                        newMedia.style.margin = "10px"; // 隙間を確保
                        break;
                    case "audio":
                        newMedia = document.createElement("audio");
                        newMedia.controls = true;
                        newMedia.autoplay = true;
                        break;
                    default:
                        return;
                }
                newMedia.id = `media-${publication.id}`;
                stream.attach(newMedia);
                remoteMediaArea.appendChild(newMedia);
            };
        };

        room.publications.forEach(subscribeAndAttach);
        room.onStreamPublished.add((e) => subscribeAndAttach(e.publication));

        leaveButton.onclick = async() => {
            await me.leave();
            await room.dispose();

            myId.textContent = "";
            buttonArea.replaceChildren();
            remoteMediaArea.replaceChildren();
        };

        room.onStreamUnpublished.add((e) => {
            document.getElementById(`subscribe-button-${e.publication.id}`) ? .remove();
            document.getElementById(`media-${e.publication.id}`) ? .remove();
        });
    };
})();