"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var serverTransport_exports = {};
__export(serverTransport_exports, {
  SocketServerTransport: () => SocketServerTransport,
  WebSocketServerTransport: () => WebSocketServerTransport
});
module.exports = __toCommonJS(serverTransport_exports);
var import_events = require("events");
class WebSocketServerTransport {
  constructor(ws) {
    this._ws = ws;
  }
  send(message) {
    this._ws.send(message);
  }
  close(reason) {
    this._ws.close(reason?.code, reason?.reason);
  }
  on(event, handler) {
    this._ws.on(event, handler);
  }
  isClosed() {
    return this._ws.readyState === this._ws.CLOSING || this._ws.readyState === this._ws.CLOSED;
  }
}
class SocketServerTransport extends import_events.EventEmitter {
  constructor(socket) {
    super();
    this._closed = false;
    this._pendingBuffers = [];
    this._socket = socket;
    socket.on("data", (buffer) => this._dispatch(buffer));
    socket.on("close", () => {
      this._closed = true;
      super.emit("close");
    });
    socket.on("error", (error) => {
      super.emit("error", error);
    });
  }
  send(message) {
    if (this._closed)
      return;
    this._socket.write(message);
    this._socket.write("\0");
  }
  close(reason) {
    if (this._closed)
      return;
    this._closed = true;
    this._socket.end();
  }
  isClosed() {
    return this._closed;
  }
  _dispatch(buffer) {
    let end = buffer.indexOf("\0");
    if (end === -1) {
      this._pendingBuffers.push(buffer);
      return;
    }
    this._pendingBuffers.push(buffer.slice(0, end));
    const message = Buffer.concat(this._pendingBuffers).toString();
    super.emit("message", message);
    let start = end + 1;
    end = buffer.indexOf("\0", start);
    while (end !== -1) {
      super.emit("message", buffer.toString(void 0, start, end));
      start = end + 1;
      end = buffer.indexOf("\0", start);
    }
    this._pendingBuffers = [buffer.slice(start)];
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SocketServerTransport,
  WebSocketServerTransport
});
