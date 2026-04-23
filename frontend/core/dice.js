(function initDice(global) {
  function formatChatTime(dateValue) {
    return new Date(dateValue).toLocaleString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  }

  function buildRollSignature(rolls) {
    return rolls.map((roll) => `${roll.id}:${roll.total}`).join('|');
  }

  global.RPGCore = global.RPGCore || {};
  global.RPGCore.dice = {
    DICE_COUNTS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    DICE_FACES: [4, 6, 8, 10, 12, 14, 16, 18, 20],
    formatChatTime,
    buildRollSignature,
  };
})(window);
