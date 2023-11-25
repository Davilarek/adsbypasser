import {
  nop,
} from 'util/core';
import {
  findHandler,
} from 'util/dispatcher';
import {
  rawUSW,
  GMAPI,
  usw,
} from 'util/platform';
import {
  dumpConfig,
  loadConfig,
} from 'util/config';
import {
  warn,
  info,
} from 'util/logger';
import '__ADSBYPASSER_HANDLERS__';


const isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;


function disableWindowOpen () {
  // If ad blockers already hijacked window.open, this will fail
  try {
    usw.open = function () {
      return {
        closed: false,
      };
    };
  } catch (e) {
    warn('cannot mock window.open');
  }
  usw.alert = nop;
  usw.confirm = nop;
}


// NOTE maybe break in future Firefox release
function disableLeavePrompt (element) {
  if (!element) {
    return;
  }

  const seal = {
    set: function () {
      info('blocked onbeforeunload');
    },
  };

  // release existing events
  element.onbeforeunload = undefined;
  // prevent they bind event again
  if (isSafari) {
    // Safiri must use old-style method
    element.__defineSetter__('onbeforeunload', seal.set);
  } else {
    usw.Object.defineProperty(element, 'onbeforeunload', {
      configurable: true,
      enumerable: false,
      get: undefined,
      // this will turn to undefined in Firefox, need upstream fix
      set: seal.set,
    });
  }

  // block addEventListener
  const oael = element.addEventListener;
  const nael = function (type) {
    if (type === 'beforeunload') {
      info('blocked addEventListener onbeforeunload');
      return;
    }
    return oael.apply(this, arguments);
  };
  element.addEventListener = nael;
}


function changeTitle () {
  document.title += ' - AdsBypasser';
}


async function beforeDOMReady (handler) {
  const config = await dumpConfig();
  info('working on\n%s \nwith\n%s', window.location.toString(), JSON.stringify(config));
  disableLeavePrompt(usw);
  disableWindowOpen();
  if (typeof handler.start === 'function')
    await handler.start();
  else {
    if (handler.start.toSrc) {
      const targetSrc = handler.start.toSrc;
      window.location.href = document.querySelector(targetSrc).src;
    }
  }
}


async function afterDOMReady (handler) {
  // some sites bind the event on body
  disableLeavePrompt(usw.document.body);
  changeTitle();
  if (typeof handler.ready === 'function')
    await handler.ready();
  else {
    if (handler.ready.toSrc) {
      const targetSrc = handler.ready.toSrc;
      window.location.href = document.querySelector(targetSrc).src;
    }
  }
}


function waitDOM () {
  return new Promise((resolve) => {
    // DOM is ready
    if (document.readyState !== 'loading') {
      // means 'interactive' or 'complete'
      resolve();
      return;
    }
    // DOM is not ready
    document.addEventListener('DOMContentLoaded', () => {
      resolve();
    });
  });
}


async function main () {
  // use unsafeWindow here because usi (a manager for Android Firefox) does
  // not implement the sandbox correctly
  if (rawUSW.top !== rawUSW.self) {
    // skip frames
    return;
  }

  GMAPI.registerMenuCommand('AdsBypasser - Configure', () => {
    GMAPI.openInTab('https://adsbypasser.github.io/configure.html');
  });

  await loadConfig();

  // find by URL
  const handler = findHandler();
  if (handler) {
    await beforeDOMReady(handler);
    await waitDOM();
    await afterDOMReady(handler);

    return;
  }
}

main().catch((e) => {
  warn(e);
});
