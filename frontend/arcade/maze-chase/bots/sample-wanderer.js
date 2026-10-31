'use strict';

module.exports = function move(state) {
  const directions = MazeEngine.DIRS;
  const reverse = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
    stay: 'stay'
  };
  const you = state.you;
  const from = state.grid[you.y][you.x];

  const legal = ['up', 'down', 'left', 'right'].filter(dir => {
    let x = you.x + directions[dir][0];
    const y = you.y + directions[dir][1];
    if (you.y === state.tunnelRow) x = (x + state.width) % state.width;

    const cell = state.grid[y] && state.grid[y][x];
    if (!cell || cell === '#') return false;
    if (you.role === 'runner') return cell !== 'G' && cell !== '-';
    return !(from === 'G' && cell !== 'G' && cell !== '-')
      && !(cell === 'G' && from !== 'G' && from !== '-');
  });

  const forward = legal.filter(dir => dir !== reverse[you.dir]);
  const choices = forward.length ? forward : legal;
  return choices.length
    ? choices[Math.floor(Math.random() * choices.length)]
    : 'stay';
};
