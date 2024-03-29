<script setup>
import { ref, computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useGameStore } from "@/stores/game.js";

import { getShape } from "@/assets/js/shape.js";
import { palettes } from "@/assets/js/palettes.js";
import { preventZoom, forEachShape } from "@/assets/js/utils.js";

import Logo from "@/components/Logo.vue";
import Menu from "@/components/menu/Menu.vue";
import Info from "@/components/Info.vue";
import Button from "@/components/Button.vue";
import Canvas from "@/components/Canvas.vue";
import Sparator from "@/components/Sparator.vue";
import GameOverInfo from "@/components/GameOverInfo.vue";

const game = useGameStore();
const { map, currentShape, previewShape, nextShape, showSparator, highScore } =
  storeToRefs(game);

const mapCanvas = ref(null);
const nextCanvas = ref(null);

const score = ref(0);
const level = ref(1);

const gamePlay = ref(false);
const gameOver = ref(false);

const filledRows = [];

const volumeUp = ref(true);

let drop = false;
let down = false;
let dropTimer = null;

function playGame() {
  gamePlay.value = !gamePlay.value;

  if (!dropTimer) addShape();
  if (gamePlay.value) setDropTimer();
  if (!gamePlay.value && dropTimer) clearInterval(dropTimer);
}

function replayGame() {
  if (dropTimer) {
    clearInterval(dropTimer);
    dropTimer = null;
  }

  game.$patch({
    map: new Array(20).fill(0).map(() => new Array(10).fill(0)),
    currentShape: null,
    previewShape: null,
    nextShape: getShape(),
    showSparator: false,
  });

  gamePlay.value = false;
  gameOver.value = false;
  score.value = 0;
  level.value = 1;

  filledRows.length = 0;

  mapCanvas.value.clearMap();
  nextCanvas.value.drawNextShape();
}

function addShape() {
  currentShape.value = nextShape.value;
  previewShape.value = { ...currentShape.value };
  nextShape.value = getShape();

  const {
    type,
    pieces,
    rotation,
    x: currentX,
    y: currentY,
  } = currentShape.value;

  const cs = pieces[rotation];

  // game over
  for (let i = 0; i < cs.length; i++) {
    const x = cs[i][1] + currentX;
    const y = cs[i][0] + currentY + (type === 1 ? 1 : 2);

    if (map.value[y][x]) {
      gameOver.value = true;
      gamePlay.value = false;

      game.$patch({
        showSparator: true,
        currentShape: null,
        previewShape: null,
        nextShape: null,
      });

      clearInterval(dropTimer);
      dropTimer = null;

      updateHighScore();

      return;
    }
  }

  if (currentShape.value) mapCanvas.value.drawGame();
  nextCanvas.value.drawNextShape();
}

function setDropTimer() {
  if (gameOver.value) return;

  let timestep = Math.round(80 + 800 * Math.pow(0.75, level.value - 1));

  if (drop) {
    timestep = 10;
  } else if (down) {
    timestep = 80;
  } else {
    timestep = Math.max(10, timestep);
  }

  if (dropTimer) {
    clearInterval(dropTimer);
    dropTimer = null;
  }

  dropTimer = setInterval(() => {
    fallShape();
  }, timestep);
}

function fallShape() {
  if (moveShape(0, 1)) return;
  landShape();
}

function landShape() {
  if (drop) drop = false;

  mergeShape();
  getFilledRows();

  if (filledRows.length > 0) {
    cleanFilledRows();
    updateScore();
    updateLevel();
  }

  addShape();
  setDropTimer();
}

function moveShapeDown(direction, enable) {
  if (!gamePlay.value) return;

  if (direction === "down") {
    down = enable;
  } else {
    drop = enable;
  }

  setDropTimer();
}

function rotateShape() {
  if (!gamePlay.value) return;

  const {
    x: currentX,
    y: currentY,
    pieces: currentPieces,
    rotation: currentRotation,
  } = currentShape.value;

  const nowRotation = currentRotation;
  const resultRotation = (currentRotation + 1) % currentPieces.length;

  currentShape.value.rotation = resultRotation;
  previewShape.value.rotation = resultRotation;

  const currentPiece = currentShape.value.pieces[currentShape.value.rotation];

  for (let i = 0; i < currentPiece.length; i++) {
    const x = currentPiece[i][1] + currentX;
    const y = currentPiece[i][0] + currentY;

    if (
      y >= 0 &&
      (map.value[y] === undefined ||
        map.value[y][x] === undefined ||
        map.value[y][x] > 0)
    ) {
      currentShape.value.rotation = nowRotation;
      previewShape.value.rotation = nowRotation;
    }
  }

  mapCanvas.value.drawGame();
}

function moveShape(xStep, yStep) {
  if (!gamePlay.value) return;

  const {
    x: currentX,
    y: currentY,
    pieces: currentPieces,
    rotation: currentRotation,
  } = currentShape.value;

  const cs = currentPieces[currentRotation];
  const m = map.value;
  const w = map.value[0].length;
  const h = map.value.length;

  let canMove = true;

  for (let i = 0; i < cs.length; i++) {
    const x = cs[i][1] + currentX + xStep;
    const y = cs[i][0] + currentY + yStep;

    if (x < 0 || x >= w || y >= h || (m[y] && m[y][x])) {
      canMove = false;
      return canMove;
    }
  }

  if (canMove) {
    currentShape.value.x += xStep;
    currentShape.value.y += yStep;
    previewShape.value.x += xStep;
    mapCanvas.value.drawGame();
  }

  return canMove;
}

function mergeShape() {
  const { type, x, y } = currentShape.value;

  forEachShape(
    currentShape,
    (shape, x, y) => {
      if (y >= 0) map.value[y][x] = type + 1;
    },
    x,
    y
  );
}

function cleanFilledRows() {
  for (let i = 0; i < filledRows.length; i++) {
    map.value.splice(filledRows[i], 1);
    map.value.unshift(new Array(10).fill(0));
  }
}

function updateScore() {
  if (filledRows.length > 0) {
    score.value +=
      (filledRows.length * level.value + (filledRows.length - 1)) * 10;
  }
}

function updateHighScore() {
  if (score.value >= highScore.value) {
    localStorage.setItem("highScore", score.value);
  }
  highScore.value = localStorage.getItem("highScore");
}

function updateLevel() {
  let nextLevelScore = (level.value + 1) * 100 * level.value;

  while (score.value >= nextLevelScore) {
    level.value++;
    nextLevelScore = (level.value + 1) * 100 * level.value;
  }
}

function getFilledRows() {
  const m = map.value;

  filledRows.length = 0; // clear array

  for (let i = 0; i < m.length; i++) {
    if (m[i].every((item) => !!item)) {
      filledRows.push(i);
    }
  }
}

onMounted(() => {
  // preventZoom();
});
</script>

<template>
  <header class="flex justify-between items-center w-full">
    <Logo />
    <Menu :playStatus="gamePlay" @play="playGame" />
  </header>

  <main class="flex justify-between items-center w-full">
    <Canvas ref="mapCanvas" name="map" width="200" height="400" />
    <div class="flex flex-col justify-between items-center h-full">
      <Info title="SCORE">
        <span>{{ score }}</span>
      </Info>
      <Info title="HI-SCORE">
        <span>{{ highScore }}</span>
      </Info>
      <Info title="NEXT">
        <Canvas ref="nextCanvas" name="next" width="80" height="40" />
      </Info>
      <Info title="LEVEL">
        <span>{{ level }}</span>
      </Info>
    </div>
  </main>

  <hr class="w-full border-t-4 border-dashed border-black" />

  <div class="flex w-full">
    <div class="flex flex-col justify-center items-center w-1/2">
      <Button
        description="direction"
        icon="icon-[pixelarticons--arrow-bar-down]"
        @click.prevent="moveShapeDown('drop', true)"
      />
      <div class="flex justify-between items-center w-full">
        <Button
          description="direction"
          icon="icon-[pixelarticons--chevron-left]"
          @click.prevent="moveShape(-1, 0)"
        />
        <Button
          description="direction"
          icon="icon-[pixelarticons--chevron-right]"
          @click.prevent="moveShape(1, 0)"
        />
      </div>
      <Button
        description="direction"
        icon="icon-[pixelarticons--chevron-down]"
        @touchstart.prevent="moveShapeDown('down', true)"
        @touchend.prevent="moveShapeDown('down', false)"
      />
    </div>
    <div class="flex flex-col justify-between items-end w-1/2">
      <div class="flex gap-4">
        <Button
          description="box"
          :icon="
            gamePlay
              ? 'icon-[pixelarticons--pause]'
              : 'icon-[pixelarticons--play]'
          "
          @click.prevent="playGame"
        />
        <Button
          description="box"
          icon="icon-[pixelarticons--reload]"
          @click.prevent="replayGame"
        />
        <Button
          description="box"
          :icon="
            volumeUp
              ? 'icon-[pixelarticons--volume-vibrate]'
              : 'icon-[pixelarticons--volume-x]'
          "
        />
      </div>
      <Button
        description="rotate"
        icon="icon-[pixelarticons--redo]"
        @click.prevent="rotateShape"
      />
    </div>
  </div>
  <Sparator />
  <GameOverInfo
    :score="score"
    :highScore="highScore"
    :gameOver="gameOver"
    @replay="replayGame"
  />
</template>
