const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const Shape = require("./src/Shape.js");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const rooms = {};
const players = {};

io.on("connection", (socket) => {
  console.log("user connected");

  // 创建房间
  socket.on("createRoom", () => {
    const room = generateRoomId();
    socket.join(room);

    const player = (players[socket.id] = {
      room,
      ready: 0,
      score: 0,
      page: "ready",
    });
    rooms[room] = { [socket.id]: player };

    socket.emit("roomCreated", rooms[room]);
  });

  // 加入房间
  socket.on("joinRoom", ({ action, room, ready, score, page }) => {
    const clients = io.sockets.adapter.rooms.get(room);
    const playerId = socket.id;

    // // 房间内只有一个玩家刷新时将玩家加入房间
    if (action && !clients) {
      socket.join(room);

      const player = (players[playerId] = { room, ready, score, page });
      rooms[room] = { [playerId]: player };

      socket.emit("roomJoined", rooms[room]);
      return;
    }

    // 通过房间号加入房间或者房间内有两个玩家刷新时将玩家加入房间
    if (!clients || clients.size >= 2) {
      socket.emit("roomFull");
    } else {
      socket.join(room);

      players[playerId] = { room, ready, score, page };
      rooms[room][playerId] = players[playerId];

      socket.emit("roomJoined", rooms[room]);
      socket.to(room).emit("playerJoined", rooms[room]);
    }
  });

  // 玩家准备
  socket.on("ready", ({ room, ready }) => {
    const playerId = socket.id;
    emitByAttr(
      playerId,
      room,
      "ready",
      ready,
      "zeroPlayerReady",
      "onePlayerReady",
      "twoPlayerReady"
    );
  });

  // 更新分数
  socket.on("updateScore", ({ room, score }) => {
    const playerId = socket.id;

    rooms[room][playerId].score = score;
    io.to(room).emit("updateScore", rooms[room]);
  });

  socket.on("startGame", ({ room, gameStart }) => {
    const playerId = socket.id;
    emitByAttr(
      playerId,
      room,
      "gameStart",
      gameStart,
      "zeroStartGame",
      "oneStartGame",
      "twoStartGame"
    );
  });

  // 游戏结束
  socket.on("gameOver", ({ room, gameOver }) => {
    const playerId = socket.id;
    emitByAttr(
      playerId,
      room,
      "gameOver",
      gameOver,
      "zeroPlayerGameOver",
      "onePlayerGameOver",
      "twoPlayerGameOver"
    );
  });

  // 再一次游戏
  socket.on("again", ({ room, again }) => {
    const playerId = socket.id;
    emitByAttr(
      playerId,
      room,
      "again",
      again,
      "zeroPlayerAgain",
      "onePlayerAgain",
      "twoPlayerAgain"
    );
  });

  // 玩家离开房间
  socket.on("disconnect", () => {
    console.log("user disconnected");

    const playerId = socket.id;
    const player = players[playerId];

    if (player) {
      const { room, page } = player;

      delete players[playerId];
      delete rooms[room][playerId];

      if (page === "ready") {
        io.to(room).emit("playerLeftRoom");
      } else if (page === "game") {
        io.to(room).emit("playerLeftGame");
      }

      if (Object.keys(rooms[room]).length < 1) {
        delete rooms[room];
      }
    }
  });
});

const port = process.env.PORT || 3000;

httpServer.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

// 生成房间ID
function generateRoomId() {
  return uuidv4().substring(0, 8);
}

// 根据属性值发出事件
function emitByAttr(
  playerId,
  room,
  attr,
  attrValue,
  zeroEvent,
  oneEvent,
  twoEvent
) {
  try {
    const status = (rooms[room][playerId][attr] = Number(attrValue));

    const zeroCheck = Object.keys(rooms[room]).every(
      (key) => rooms[room][key][attr] == 0
    );

    if (zeroCheck) {
      io.to(room).emit(zeroEvent, rooms[room]);
      return;
    }

    const twoCheck = Object.keys(rooms[room]).every(
      (key) => rooms[room][key][attr] == 1
    );

    if (twoCheck && Object.keys(rooms[room]).length > 1) {
      io.to(room).emit(twoEvent, rooms[room]);
      return;
    }

    Object.keys(rooms[room]).forEach((key) => {
      if ((status && key === playerId) || (!status && key !== playerId)) {
        io.to(room).emit(oneEvent, rooms[room]);
        return;
      }
    });
  } catch (error) { }
}
