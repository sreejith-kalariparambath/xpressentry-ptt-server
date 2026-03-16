const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 });

let clients = new Map();     // ws -> { channel, deviceName }
let speakers = new Map();    // channel -> ws

wss.on('connection', function connection(ws) {

    console.log("Client connected");

    ws.send(JSON.stringify({
        type: "server_connected",
        message: "Welcome client"
    }));

    ws.on('message', function incoming(message) {

        console.log("Received:", message.toString());

        const data = JSON.parse(message);

        // JOIN CHANNEL
        if (data.type === "join_channel") {

            clients.set(ws, { channel: data.channel, deviceName: data.deviceName || "Unknown" });

            console.log("Client joined channel:", data.channel, "as", data.deviceName);

            ws.send(JSON.stringify({
                type: "joined_channel",
                channel: data.channel,
                status: "ok"
            }));

            return;
        }

        const { channel: senderChannel, deviceName: senderDeviceName } = clients.get(ws) || {};

        // PTT START REQUEST
        if (data.type === "ptt_start") {

            const currentSpeaker = speakers.get(senderChannel);

            if (!currentSpeaker) {

                speakers.set(senderChannel, ws);

                // notify channel that it is busy
                broadcast(senderChannel, {
                    type: "channel_status",
                    status: "busy",
                    speakerName: senderDeviceName
                });

                ws.send(JSON.stringify({
                    type: "ptt_granted"
                }));

            } else {

                ws.send(JSON.stringify({
                    type: "ptt_denied"
                }));

            }

            return;
        }

        // PTT STOP
        if (data.type === "ptt_stop") {

            const currentSpeaker = speakers.get(senderChannel);

            if (currentSpeaker === ws) {

                speakers.delete(senderChannel);

                broadcast(senderChannel, {
                    type: "channel_status",
                    status: "idle"
                });

            }

            return;
        }

        // NORMAL MESSAGE BROADCAST (your existing logic)
        clients.forEach(({ channel }, client) => {

            if (
                client !== ws &&
                channel === senderChannel &&
                client.readyState === WebSocket.OPEN
            ) {
                client.send(JSON.stringify(data));
            }

        });

    });

    ws.on('close', () => {

        console.log("Client disconnected");

        const { channel } = clients.get(ws) || {};

        const currentSpeaker = speakers.get(channel);

        // if speaker disconnects → free channel
        if (currentSpeaker === ws) {

            speakers.delete(channel);

            broadcast(channel, {
                type: "channel_status",
                status: "idle"
            });

        }

        clients.delete(ws);
    });

});


function broadcast(channel, message) {

    clients.forEach(({ channel: ch }, client) => {

        if (ch === channel && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }

    });

}

console.log("WebSocket server running on port 8081");
