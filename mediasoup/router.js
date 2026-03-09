const config = require("../config");
const { getWorker } = require("./worker");

async function createRouter() {

    const worker = getWorker();

    const router = await worker.createRouter({
        mediaCodecs: config.mediasoup.router.mediaCodecs
    });

    console.log("Router created");

    return router;
}

module.exports = {
    createRouter
};