"use strict";
/**
 * Port Manager - Track local server port
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalServerPort = getLocalServerPort;
exports.setLocalServerPort = setLocalServerPort;
let localServerPort = null;
function getLocalServerPort() {
    return localServerPort;
}
function setLocalServerPort(port) {
    localServerPort = port;
}
