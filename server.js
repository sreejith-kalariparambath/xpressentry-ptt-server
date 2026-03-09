const express = require("express");
const http = require("http");

const config = require("./config");

const { createWorker } = require("./mediasoup/worker");
const { startWebSocketServer } = require("./signaling/websocketServer");

async function startServer() {

    const app = express();

    app.use(express.static("public"));

    const server = http.createServer(app);

    await createWorker();

    startWebSocketServer(server);

    server.listen(config.port, () => {

        console.log(
            ` XPressEntry PTT SFU running on port ${config.port}`
        );
    });
}

startServer();