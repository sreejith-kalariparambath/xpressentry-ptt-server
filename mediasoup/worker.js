const mediasoup = require("mediasoup");
const config = require("../config");

let worker;

async function createWorker() {

    worker = await mediasoup.createWorker({
        rtcMinPort: config.mediasoup.worker.rtcMinPort,
        rtcMaxPort: config.mediasoup.worker.rtcMaxPort
    });

    console.log("Mediasoup Worker started");

    worker.on("died", () => {
        console.error("Mediasoup worker died");
        process.exit(1);
    });

    return worker;
}

function getWorker() {
    return worker;
}

module.exports = {
    createWorker,
    getWorker
};