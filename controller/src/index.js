import { flattenCorrect, score } from './scoring';

import _ from 'lodash';

export function outcome(question, session, env) {
  session.value = session.value || [];
  return new Promise((resolve, reject) => {
    if (!question || !question.correctResponse || _.isEmpty(question.correctResponse)) {
      reject(new Error('Question is missing required array: correctResponse'));
    } else {
      resolve({
        score: {
          scaled: score(question, session)
        }
      });
    }
  });

}

export function model(question, session, env) {
  console.log('[state] question:', JSON.stringify(question, null, '  '));
  console.log('[state] session:', JSON.stringify(session, null, '  '));
  console.log('[state] env:', JSON.stringify(env, null, '  '));

  function lookup(value) {
    var localeKey = env.locale || (question.translations || {}).default_locale || 'en_US';
    var map = ((question.translations || {})[localeKey] || {});
    if (value.indexOf('$') === 0) {
      var key = value.substring(1);
      var out = map[key];
      if (!out) {
        console.warn('not able to find translation for: ' + key);
      }
      return out || value;
    } else {
      return value;
    }
  }

  /**
   * If there is a shuffled order stored in the session, restore it. Otherwise shuffle
   * all choices which do not have their shuffle property explicitly set to false. 
   */
  function shuffle(session, choices) {
    if (session.stash && session.stash.shuffledOrder) {
      return session.stash.shuffledOrder.map((choiceId) => {
        return choices.find(({ id }) => {
          return id === choiceId;
        });
      });
    } else {
      let result = _.cloneDeep(choices);
      for (var i = choices.length - 1; i >= 0; i--) {
        if (choices[i].shuffle === false) {
          result.splice(i, 1);
        }
      }
      let shuffled = _.shuffle(_.cloneDeep(result));
      choices.forEach((choice, index) => {
        if (choice.shuffle === false) {
          shuffled.splice(index, 0, choice);
        }
      });
      session.stash = session.stash || {};
      session.stash.shuffledOrder = shuffled.map(({ id }) => id);
      return shuffled;
    }
  }

  var base = _.assign({}, _.cloneDeep(question.model));
  base.prompt = lookup(base.prompt);
  base.outcomes = [];
  base.completeLength = question.correctResponse.length;
  let choices = question.config && question.config.shuffle ? shuffle(session, base.choices) : base.choices;
  base.choices = _.map(choices, (c) => {
    c.label = lookup(c.label);
    return c;
  });

  if (env.mode !== 'gather') {
    base.disabled = true;
  }

  if (env.mode === 'evaluate') {
    base.outcomes = _.map(session.value, function (c, idx) {
      return {
        id: c,
        outcome: flattenCorrect(question)[idx] === c ? 'correct' : 'incorrect'
      }
    });
    var allCorrect = _.isEqual(flattenCorrect(question), session.value);
    if (!allCorrect) {
      base.correctResponse = flattenCorrect(question);
    }
  }

  base.env = env;

  var map = {
    black_on_rose: 'black-on-rose',
    white_on_black: 'white-on-black',
    black_on_white: 'default'
  };

  if (env.accessibility && env.accessibility.colorContrast && map[env.accessibility.colorContrast]) {
    base.className = map[env.accessibility.colorContrast];
  }

  console.log('[state] return: ' + JSON.stringify(base, null, '  '));
  return Promise.resolve(base);
}
