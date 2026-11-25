// PresentFlow website: a scripted replay of a talk. No microphone, no speech recognition: each step is a
// snapshot of what the real app shows after hearing that text. Memory cues were generated with the app's
// own cue extractor (src/core/text/cues.ts) for this script.
;(function () {
  'use strict'
  var root = document.querySelector('[data-demo]')
  if (!root) return

  var LINES = {
    w1: { s: 'welcome', text: 'Good morning, and welcome to my talk on the safety of AI agents.', cue: ['morning', 'welcome', 'safety', 'AI'] },
    w2: { s: 'welcome', text: 'Today I want to show you why this topic is so urgent right now.', cue: ['Today', 'want', 'topic', 'urgent'] },
    w3: { s: 'welcome', text: 'By the end you will know three concrete risks and three countermeasures.', cue: ['three', 'concrete', 'risks', 'countermeasures'] },
    s1: { s: 'stand', text: 'AI agents no longer answer single questions, they run whole chains of tasks.', cue: ['answer', 'single', 'whole', 'chains'] },
    s2: { s: 'stand', text: 'They write code, book appointments and control other programs.', cue: ['write', 'appointments', 'control', 'programs'] },
    t1: { s: 'test', text: 'For our study we built a closed test environment.', cue: ['study', 'built', 'closed', 'environment'] },
    t2: { s: 'test', text: 'Twelve different agents received realistic office tasks.', cue: ['Twelve', 'different', 'received', 'realistic'] },
    t3: { s: 'test', text: 'Each agent had access to files, email and a command line.', cue: ['access', 'files', 'email', 'command'] },
    m1: { s: 'why', text: 'This matters because many AI agents will soon work on complex tasks for long periods.', cue: ['matters', 'AI', 'complex', 'periods'] },
    m2: { s: 'why', text: 'Small wrong incentives can grow over many steps.', cue: ['Small', 'wrong', 'incentives', 'steps'] },
    m3: { s: 'why', text: 'When nobody is watching, such deviations show up late.', cue: ['nobody', 'watching', 'such', 'deviations'] },
    k1: { s: 'counter', text: 'First, agents should only get the permissions their task really needs.', cue: ['First', 'get', 'permissions', 'really'] }
  }
  var SECTIONS = {
    welcome: { title: 'Welcome', slide: 1, lines: ['w1', 'w2', 'w3'] },
    stand: { title: 'Where we stand', slide: 1, lines: ['s1', 's2'] },
    test: { title: 'Test environment', slide: 2, lines: ['t1', 't2', 't3'] },
    why: { title: 'Why this matters', slide: 3, lines: ['m1', 'm2', 'm3'] },
    counter: { title: 'Countermeasures', slide: 3, lines: ['k1'] },
    wrap: { title: 'Wrap-up', slide: 4, lines: [] }
  }
  var SLIDES = [
    { n: 1, title: 'Slide 1 — Opening', sections: ['welcome', 'stand'] },
    { n: 2, title: 'Slide 2 — Experiments', sections: ['test'] },
    { n: 3, title: 'Slide 3 — Why it matters', sections: ['why', 'counter'] },
    { n: 4, title: 'Slide 4 — Closing', sections: ['wrap'] }
  ]

  var END = 'note:End of slide · Next: Slide 3 — Why it matters'
  // Each snapshot was checked against the real app by replaying this script with e2e/app.ts hear().
  var STEPS = [
    { scene: 0, heard: '', where: 'welcome', said: [], view: ['cur:w1', 'next:w2'],
      caption: 'Press play. PresentFlow is waiting for the first sentence.' },
    { scene: 0, heard: LINES.w1.text, where: 'welcome', said: ['w1'], view: ['prev:w1', 'cur:w2', 'next:w3'],
      caption: 'It follows along. The sentence you finished moves up and fades; the next one is right below.' },
    { scene: 1, heard: "Today I'd like to show you why this matters so much right now.", where: 'welcome', said: ['w1', 'w2'],
      view: ['older:w1', 'prev:w2', 'cur:w3', 'next:s1'],
      caption: 'Paraphrasing is fine. PresentFlow matches the meaning, not only the exact words.' },
    { scene: 2, heard: LINES.s1.text, where: 'stand', said: ['w1', 'w2', 's1'],
      view: ['older:w2', 'older:w3', 'prev:s1', 'cur:s2', 'next:t1'],
      caption: 'You skipped a sentence and moved on. The view follows you; “Welcome” stays half done in the slide list until you get back to it.' },
    { scene: 3, heard: LINES.m1.text, where: 'stand', said: ['w1', 'w2', 's1'],
      view: ['older:w2', 'older:w3', 'prev:s1', 'cur:s2', 'next:t1'],
      caption: 'Now you jump ahead to slide 3. One sentence is not enough: PresentFlow waits for confirmation, so a stray remark never moves the view.' },
    { scene: 3, heard: LINES.m2.text, where: 'why', said: ['w1', 'w2', 's1', 'm1', 'm2'],
      view: ['older:t3', 'older:m1', 'prev:m2', 'cur:m3', 'next:k1'],
      caption: 'Confirmed. The view jumps to “Why this matters”, and both sentences count as said. Slide 1 stays half done.' },
    { scene: 4, heard: '', ppt: 2, where: 'test', said: ['w1', 'w2', 's1', 'm1', 'm2'],
      view: ['cur:t1', 'next:t2'],
      caption: 'PowerPoint is open, and you click back to slide 2. The slide on screen decides: PresentFlow goes to its first open section.' },
    { scene: 4, heard: LINES.t1.text, ppt: 2, where: 'test', said: ['w1', 'w2', 's1', 'm1', 'm2', 't1'],
      view: ['prev:t1', 'cur:t2', 'next:t3', END],
      caption: 'Within the slide, it follows your speech as usual. After the slide’s last sentence comes a marked end, not slide 3.' },
    { scene: 4, heard: LINES.t2.text, ppt: 2, where: 'test', said: ['w1', 'w2', 's1', 'm1', 'm2', 't1', 't2'],
      view: ['older:t1', 'prev:t2', 'cur:t3', END],
      caption: 'The last sentence of the slide. Nothing from slide 3 appears early.' },
    { scene: 4, heard: LINES.t3.text, ppt: 2, where: 'test', said: ['w1', 'w2', 's1', 'm1', 'm2', 't1', 't2', 't3'],
      view: ['older:t1', 'older:t2', 'prev:t3', 'done:✓ Slide done · Next: Slide 3 — Why it matters'],
      caption: 'Slide done. PresentFlow holds here until you click to the next slide. That is the end of the demo.' }
  ]

  var $ = function (sel) {
    return root.querySelector(sel)
  }
  var el = {
    stage: $('[data-stage]'),
    points: $('[data-points]'),
    slides: $('[data-slides]'),
    where: $('[data-where]'),
    status: $('[data-status]'),
    statusText: $('[data-status-text]'),
    chip: $('[data-chip]'),
    chipText: $('[data-chip-text]'),
    heard: $('[data-heard]'),
    caption: $('[data-caption]'),
    play: $('[data-play]'),
    next: $('[data-next]'),
    restart: $('[data-restart]'),
    scenes: root.querySelectorAll('[data-scenes] li')
  }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function node(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  function icon() {
    return node('span', 'd-ico')
  }

  /** The current sentence with its memory-cue words in bold, as in the app. */
  function emphasized(line) {
    var p = node('p', 'd-line cur')
    var cue = line.cue.map(function (w) {
      return w.toLowerCase()
    })
    line.text.split(/(\s+)/).forEach(function (part) {
      var word = part.replace(/[^\p{L}\p{N}-]/gu, '').toLowerCase()
      if (word && cue.indexOf(word) >= 0) {
        var m = part.match(/^(.*?)([\p{L}\p{N}-]+)(.*)$/u)
        p.appendChild(document.createTextNode(m[1]))
        p.appendChild(node('b', null, m[2]))
        p.appendChild(document.createTextNode(m[3]))
      } else {
        p.appendChild(document.createTextNode(part))
      }
    })
    return p
  }

  function renderStage(step) {
    var frag = document.createDocumentFragment()
    var lastSection = null
    step.view.forEach(function (item) {
      var i = item.indexOf(':')
      var role = item.slice(0, i)
      var value = item.slice(i + 1)
      if (role === 'note') return frag.appendChild(node('p', 'd-note', value))
      if (role === 'done') return frag.appendChild(node('p', 'd-done', value))
      var line = LINES[value]
      if (lastSection && line.s !== lastSection) {
        // A next line on another slide also names the slide, as in the app.
        var sec = SECTIONS[line.s]
        var otherSlide = sec.slide !== SECTIONS[lastSection].slide
        var label = role === 'next' ? '→ ' + (otherSlide ? SLIDES[sec.slide - 1].title + ' · ' : '') + sec.title : sec.title
        frag.appendChild(node('p', role === 'next' ? 'd-label cont' : 'd-label', label))
      }
      lastSection = line.s
      frag.appendChild(role === 'cur' ? emphasized(line) : node('p', 'd-line ' + role, line.text))
    })
    el.stage.replaceChildren(frag)
  }

  function lineState(step, id, cur) {
    if (step.said.indexOf(id) >= 0) return 'said'
    return id === cur ? 'current' : 'open'
  }
  function sectionState(step, key) {
    var lines = SECTIONS[key].lines
    var said = lines.filter(function (id) {
      return step.said.indexOf(id) >= 0
    }).length
    if (key === step.where) return 'active'
    if (lines.length && said === lines.length) return 'done'
    return said ? 'partial' : 'open'
  }

  function renderSide(step) {
    var curItem = step.view.filter(function (v) {
      return v.indexOf('cur:') === 0
    })[0]
    var cur = curItem ? curItem.slice(4) : null
    var section = SECTIONS[step.where]

    var points = document.createDocumentFragment()
    points.appendChild(node('h4', null, section.title))
    section.lines.forEach(function (id) {
      var row = node('div', 'd-point ' + lineState(step, id, cur))
      row.appendChild(icon())
      row.appendChild(node('span', null, LINES[id].cue.join(' → ')))
      points.appendChild(row)
    })
    el.points.replaceChildren(points)

    var slides = document.createDocumentFragment()
    slides.appendChild(node('h4', null, 'Slides'))
    SLIDES.forEach(function (slide) {
      var states = slide.sections.map(function (k) {
        return sectionState(step, k)
      })
      var isActive = slide.sections.indexOf(step.where) >= 0
      var allDone = states.every(function (st) {
        return st === 'done'
      })
      var anyStarted = states.some(function (st) {
        return st !== 'open'
      })
      var row = node('div', 'd-row ' + (isActive ? 'active' : allDone ? 'done' : anyStarted ? 'partial' : 'open'))
      row.appendChild(icon())
      row.appendChild(node('span', null, slide.title))
      slides.appendChild(row)
      if (!isActive) return
      slide.sections.forEach(function (k, i) {
        var sub = node('div', 'd-row sub ' + states[i])
        sub.appendChild(icon())
        sub.appendChild(node('span', null, SECTIONS[k].title))
        slides.appendChild(sub)
      })
    })
    el.slides.replaceChildren(slides)

    var slide = SLIDES[section.slide - 1]
    el.where.replaceChildren(document.createTextNode(slide.title + ' · '), node('b', null, section.title))
    el.chip.hidden = !step.ppt
    if (step.ppt) el.chipText.textContent = 'Slide ' + step.ppt
  }

  function renderScenes(step) {
    el.scenes.forEach(function (li, i) {
      li.classList.toggle('on', i === step.scene && index > 0)
      li.classList.toggle('seen', i < step.scene)
    })
  }

  function apply(step) {
    renderStage(step)
    renderSide(step)
    renderScenes(step)
    el.caption.textContent = step.caption
  }

  // ── Playback ────────────────────────────────────────────
  var index = 0
  var playing = false
  var typing = null // interval id while the "heard" text is arriving
  var wait = null // timeout id between steps

  function clearTimers() {
    clearInterval(typing)
    clearTimeout(wait)
    typing = null
    wait = null
    el.status.classList.remove('hearing')
  }

  function updateButtons() {
    var atEnd = index >= STEPS.length - 1
    el.play.textContent = playing ? 'Pause' : atEnd ? 'Replay' : index === 0 ? 'Play' : 'Resume'
    el.next.disabled = atEnd && !typing
  }

  /** Show step i: type its heard text word by word, then apply the snapshot. */
  function goTo(i, instant) {
    clearTimers()
    index = i
    var step = STEPS[i]
    var words = step.heard ? step.heard.split(' ') : []
    if (!words.length || instant || reduceMotion) {
      el.heard.textContent = step.heard
      apply(step)
      return scheduleNext(step)
    }
    el.heard.textContent = ''
    el.status.classList.add('hearing')
    var w = 0
    typing = setInterval(function () {
      el.heard.textContent = words.slice(0, ++w).join(' ')
      if (w < words.length) return
      clearInterval(typing)
      typing = null
      el.status.classList.remove('hearing')
      wait = setTimeout(function () {
        apply(step)
        scheduleNext(step)
      }, 450)
    }, 95)
    updateButtons()
  }

  function scheduleNext(step) {
    updateButtons()
    if (!playing) return
    if (index >= STEPS.length - 1) {
      playing = false
      return updateButtons()
    }
    wait = setTimeout(function () {
      goTo(index + 1)
    }, Math.max(3200, step.caption.length * 42))
  }

  function play() {
    playing = true
    if (index >= STEPS.length - 1) return goTo(1)
    if (typing) return updateButtons() // still typing; it continues on its own
    goTo(index + 1)
  }
  function pause() {
    playing = false
    if (typing) {
      goTo(index, true) // finish the current step at once
      return
    }
    clearTimers()
    updateButtons()
  }

  el.play.addEventListener('click', function () {
    playing ? pause() : play()
  })
  el.next.addEventListener('click', function () {
    if (typing) return goTo(index, true)
    if (index < STEPS.length - 1) goTo(index + 1, !playing)
  })
  el.restart.addEventListener('click', function () {
    goTo(0, true) // continues on its own while playing
  })

  goTo(0, true)

  // Start once, the first time the demo comes into view (not with reduced motion).
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        if (!entries[0].isIntersecting) return
        io.disconnect()
        if (index === 0 && !playing) play()
      },
      { threshold: 0.45 }
    )
    io.observe(root)
  }
})()
