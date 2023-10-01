const Shape = require("./Shape.js");
const utils = require("../utils.js");
const socket = require("../socket.js");

class Game {
  constructor(mapCtx, previewCtx, shapeColor, gameMode, gameOverImage, music) {
    this.blockSize = 20;

    this.mapCtx = mapCtx;
    this.mapWidth = 10;
    this.mapHeight = 20;
    this.mapBackgroundColor = "#1e1e2e";
    this.map = [...new Array(this.mapHeight)].map(() =>
      new Array(this.mapWidth).fill(0)
    );

    this.previewCtx = previewCtx;
    this.previewWidth = 4;
    this.previewHeight = 2;
    this.previewBackgroundColor = "#313244";
    this.previewMap = [...new Array(this.previewHeight)].map(() =>
      new Array(this.previewWidth).fill(0)
    );

    this.gameMode = gameMode;

    this.gameStart = false;
    this.gamePaused = false;
    this.gameOver = false;

    this.gameOverImage = gameOverImage;

    this.music = music
    this.volumeUp = true;

    this.shape = null;
    this.nextShape = null;
    this.shapeColor = shapeColor

    this.dropTimer = null;
    this.fastForward = false;

    this.level = 1;

    this.score = 0;
    this.highScore = localStorage.getItem("highScore") || 0;

    this.animateId = null

    this.init();
  }

  // 初始化
  init() {
    this.nextShape = this.generateShape();
    this.setGameData();
  }

  // 游戏动画
  gameLoop() {
    if (this.gameStart) {
      this.drawMap()
      this.drawNextShape()
    }

    this.animateId = requestAnimationFrame(this.gameLoop.bind(this))
  }

  // 设置游戏信息
  setGameData() {
    this.resetArea(this.mapCtx, this.mapBackgroundColor, 0, 0, 200, 400);

    this.resetArea(this.previewCtx, this.previewBackgroundColor, 0, 0, 82, 42);

    document.getElementById("score").innerText = this.score;
    document.getElementById("highest-score").innerText = this.highScore;
    document.getElementById("level").innerText = this.level;
  }

  // 开始游戏
  startGame() {
    this.gameStart = true;
    this.gameOver = false
    this.addShape();
    this.setDropTimer();
    this.gameLoop()
  }

  // 结束游戏
  // XXX: again按钮和quit按钮的功能
  overGame() {
    const gameOverInfoTemplate = `
      <div class="absolute top-0 left-0 w-screen h-screen bg-crust bg-opacity-95">
      <div id="game-over-info"
        class="z-10 flex flex-col justify-around items-center fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 p-6 border-2 border-text rounded bg-surface0">
        <img id="game-over-image" alt="game over" />
        <div id="score-container" class="my-6 text-xs">
          <div>
            <label>YOUR SCORE:</label>
            <span id="your-score-info">${this.score}</span>
          </div>
          <div>
            <label id="another-score-label"></label>
            <span id="another-score-info"></span>
          </div>
          <div>
            <label id="again-label"></label>
            <span id="again-info"></span>
          </div>
        </div>
        <div class="text-xs font-semibold">
          <button id="again-btn" class="w-20 py-1 border-2 border-text rounded" type="button">
            AGAIN
          </button>
          <button id="quit-btn" class="w-20 py-1 border-2 border-text rounded" type="button">
            QUIT
          </button>
        </div>
      </div>
    `;

    const gameOverContainer = document.createElement("div");

    gameOverContainer.innerHTML = gameOverInfoTemplate;

    document.body.appendChild(gameOverContainer);

    const anotherScoreLabel = document.getElementById("another-score-label");
    const anotherScoreInfo = document.getElementById("another-score-info");

    if (this.gameMode === 'double') {
      socket.emit('gameOver', { room: sessionStorage.getItem('room'), gameOver: 1 });
    } else {
      this.updateHighScore();
      utils.setImage('game-over-image', this.gameOverImage)
      anotherScoreLabel.innerText = "HIGHEST SCORE:";
      anotherScoreInfo.innerText = this.highScore;

      document.getElementById("again-btn").addEventListener("touchstart", () => {
        location.reload();
      });
    }

    document.getElementById("quit-btn").addEventListener("touchstart", () => {
      location.replace("../index.html");
    });

  }

  // 生成形状
  generateShape() {
    return new Shape();
  }

  // 生成当前方块
  generatePiece() {
    return this.shape.shapeTable[this.shape.shapeType[this.shape.type]][
      this.shape.rotation
    ];
  }

  // 生成下一个方块
  generateNextPiece() {
    return this.nextShape.shapeTable[
      this.nextShape.shapeType[this.nextShape.type]
    ][this.nextShape.rotation];
  }

  // 添加方块
  // BUG: 游戏结束仍会有 this.shape 为 null 的情况
  addShape() {
    this.shape = this.nextShape;
    this.nextShape = this.generateShape();

    try {
      let piece = this.generatePiece();

      piece.forEach((item) => {
        let x = this.shape.xOffset + item[1],
          y = this.shape.yOffset + item[0];

        if (y >= 0 && this.map[y][x]) {
          if (this.dropTimer) {
            clearInterval(this.dropTimer);
            this.dropTimer = null;
          }

          this.gameOver = true;
          this.gameStart = false;
          this.shape = null;
          cancelAnimationFrame(this.animateId)
          this.overGame();
          return;
        }
      });
    } catch (e) { }
  }

  // 方块旋转
  rotateShape(rStep) {
    if (!this.gameStart || this.gamePaused || this.gameOver) return;

    let tempRotation = this.shape.rotation;

    this.shape.rotation += rStep;

    let r =
      this.shape.rotation %
      this.shape.shapeTable[this.shape.shapeType[this.shape.type]].length;

    this.shape.rotation = r;

    let piece = this.generatePiece();

    piece.forEach((item) => {
      const x = this.shape.xOffset + item[1],
        y = this.shape.yOffset + item[0];
      if (this.map[y] === undefined || this.map[y][x] === undefined || this.map[y][x] > 0) {
        this.shape.rotation = tempRotation;
      }
    });
  }

  // 左移
  moveLeft() {
    this.moveShape(-1, 0);
  }

  // 右移
  moveRight() {
    this.moveShape(1, 0);
  }

  // 下移
  moveDown(enable) {
    if (this.fastForward === enable || this.gameOver) return;
    if (enable && !this.moveShape(0, 1)) return;
    this.fastForward = enable;
    this.setDropTimer();
  }

  // 下坠
  dropShape() {
    if (this.shape && !this.gamePaused) {
      while (this.moveShape(0, 1)) { }
      this.fallToLand();
    }
  }

  // 移动方块
  moveShape(xStep, yStep) {
    if (!this.shape || !this.gameStart || this.gamePaused || this.gameOver) return;

    const width = this.map[0].length;
    const height = this.map.length;

    let canMove = true;

    const piece = this.generatePiece();

    piece.forEach((item) => {
      const x = this.shape.xOffset + item[1] + xStep,
        y = this.shape.yOffset + item[0] + yStep;
      if (
        x < 0 ||
        x >= width ||
        y >= height ||
        (this.map[y] && this.map[y][x])
      ) {
        canMove = false;
        return canMove;
      }
    });

    if (canMove) {
      this.shape.xOffset += xStep
      this.shape.yOffset += yStep
    }

    return canMove;
  }

  setDropTimer() {
    let timestep = Math.round(80 + 800 * Math.pow(0.75, this.level - 1));
    timestep = Math.max(10, timestep);

    if (this.fastForward) {
      timestep = 80;
    }

    if (this.dropTimer || this.gamePaused) {
      clearInterval(this.dropTimer);
      this.dropTimer = null;
    }

    if (!this.gamePaused) {
      this.dropTimer = setInterval(() => {
        this.fallToLand();
      }, timestep);
    }
  }

  fallToLand() {
    if (!this.moveShape(0, 1)) {
      this.landShape();
      this.addShape();
    }
  }

  // 方块触底后将方块合并到地图数组中
  landShape() {
    let piece = this.generatePiece();

    let isFilled = false,
      filledRows = [],
      oldLevel = this.level;

    piece.forEach((item) => {
      let x = this.shape.xOffset + item[1],
        y = this.shape.yOffset + item[0];
      this.map[y][x] = this.shape.type + 1;
    });

    // 判断是否有满行
    this.map.forEach((row, index) => {
      isFilled = row.every((item) => !!item);

      if (isFilled) {
        filledRows.push(index);

        // 消除行
        row.fill(8);

        setTimeout(() => {
          this.map.splice(index, 1);
          this.map.unshift(new Array(10).fill(0));
        }, 100);

        this.music.fetchMusic(0.1900, 0.7000)
      }
    });

    if (filledRows.length) {
      this.updateScore(filledRows.length, this.level);
      this.updateLevel();
    }

    if (oldLevel !== this.level) {
      this.setDropTimer();
    }
  }

  // 更新分数
  updateScore(filledRows, level) {
    this.score += filledRows * level * 10;
    document.getElementById("score").innerText = this.score;

    if (this.gameMode === 'double') {
      socket.emit('updateScore', { room: sessionStorage.getItem("room"), score: this.score })
    }
  }

  // 更新最高分数
  updateHighScore() {
    if (this.score > this.highScore) {
      localStorage.setItem("highScore", this.score);
    }
  }

  // 更新等级
  updateLevel() {
    const nextLevelScore = (this.level + 1) * 100 * this.level;

    if (this.score >= nextLevelScore) {
      this.level += 1;
      this.updateLevel();
      document.getElementById("level").innerText = this.level;
    }
  }
  drawMap() {
    const mapCtx = this.mapCtx;
    const mapBackgroundColor = this.mapBackgroundColor;
    const map = this.map;
    const piece = this.generatePiece();

    const shapeType = this.shape.type;
    let xOffset = this.shape.xOffset;
    let yOffset = this.shape.yOffset;

    this.drawArea(
      mapCtx,
      mapBackgroundColor,
      0,
      0,
      200,
      400,
      map,
      piece,
      shapeType,
      xOffset,
      yOffset
    );
  }

  drawNextShape() {
    const previewCtx = this.previewCtx;
    const previewBackgroundColor = this.previewBackgroundColor;
    const previewMap = this.previewMap;
    const piece = this.generateNextPiece();

    const shapeType = this.nextShape.type;

    this.drawArea(
      previewCtx,
      previewBackgroundColor,
      0,
      0,
      80,
      40,
      previewMap,
      piece,
      shapeType,
      0,
      0
    );
  }

  // 绘制画布区域
  drawArea(
    ctx,
    backgroundColor,
    canvasX,
    canvasY,
    canvasWidth,
    canvasHeight,
    area,
    piece,
    shapeType,
    xOffset,
    yOffset
  ) {
    // 清空预览画布
    this.resetArea(
      ctx,
      backgroundColor,
      canvasX,
      canvasY,
      canvasWidth,
      canvasHeight
    );

    // 绘制游戏地图方格
    for (let i = 0; i < area.length; i++) {
      for (let j = 0; j < area[i].length; j++) {
        if (area[i][j]) {
          ctx.fillStyle = this.setShapeColor(area[i][j]);
          this.drawBlock(ctx, j, i);
        }
      }
    }

    // 在画布上绘制方块
    ctx.fillStyle = this.setShapeColor(shapeType + 1);

    for (let i = 0, length = piece.length; i < length; i++) {
      let x = piece[i][1] + xOffset;
      let y = piece[i][0] + yOffset;

      if (ctx.canvas.id === "map-canvas") {
        this.drawBlock(ctx, x, y);
      } else {
        switch (shapeType) {
          case 0:
            this.drawBlock(ctx, x, y);
            break;
          case 1:
            this.drawBlock(ctx, x, y, 0, 10);
            break;
          default:
            this.drawBlock(ctx, x, y, 10, 0);
            break;
        }
      }
    }
  }

  resetArea(ctx, backgroundColor, canvasX, canvasY, canvasWidth, canvasHeight) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);
  }

  // 绘制方块
  drawBlock(ctx, x = 1, y = 1, xOffset = 0, yOffset = 0) {
    ctx.fillRect(
      x * this.blockSize + xOffset,
      y * this.blockSize + yOffset,
      this.blockSize,
      this.blockSize
    );
  }

  // 设置颜色
  setShapeColor(type) {
    const colorIndex = type - 1
    switch (type) {
      case 1:
        return this.shapeColor[colorIndex];
      case 2:
        return this.shapeColor[colorIndex];
      case 3:
        return this.shapeColor[colorIndex];
      case 4:
        return this.shapeColor[colorIndex];
      case 5:
        return this.shapeColor[colorIndex];
      case 6:
        return this.shapeColor[colorIndex];
      case 7:
        return this.shapeColor[colorIndex];
      case 8:
        return this.shapeColor[colorIndex];
    }
  }
}

module.exports = Game;