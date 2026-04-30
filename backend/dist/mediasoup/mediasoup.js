"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mediasoup = __importStar(require("mediasoup"));
//Worker    A C++ process that handles all RTP packets
//Router    One virtual SFU (one room)
//Transport One client’s connection
//Producer  One incoming media track
//Consumer  One outgoing media track
//RTP capabilities  Codec negotiation
//
let workerType;
let rtpParams;
let rtpCapabilities;
//asks whaat codecs the machines supports
async function initRtpCapabilities() {
    rtpCapabilities = await mediasoup.getSupportedRtpCapabilities();
}
initRtpCapabilities();
//These are the only codecs allowed inside this SFU room.
//This creates a shared ICE listener.
//Instead of each transport opening random ports, all clients connect to:9.9.9.9:20000
//# sourceMappingURL=mediasoup.js.map