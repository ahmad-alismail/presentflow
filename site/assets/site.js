// PresentFlow website: header state, mobile menu and the hero's lyrics stage.
;(function () {
  'use strict'
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Header: border once scrolled, menu toggle on small screens.
  var header = document.querySelector('.site-header')
  var toggle = document.querySelector('.nav-toggle')
  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 8)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }
  if (header && toggle) {
    var setOpen = function (open) {
      header.classList.toggle('open', open)
      toggle.setAttribute('aria-expanded', String(open))
      toggle.textContent = open ? 'Close' : 'Menu'
    }
    toggle.addEventListener('click', function () {
      setOpen(!header.classList.contains('open'))
    })
    header.querySelectorAll('.site-nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        setOpen(false)
      })
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false)
    })
  }

  // Hero: the sentences of a talk move up like song lyrics. Keywords (the memory cue) in tungsten.
  var stage = document.querySelector('[data-lyrics]')
  if (!stage || reduceMotion) return
  var lines = [
    'Good morning, and welcome to my talk on the safety of AI agents.',
    'Today I want to show you why this topic is so urgent right now.',
    'By the end you will know <b>three</b> <b>concrete</b> <b>risks</b> and three <b>countermeasures</b>.',
    'AI agents no longer <b>answer</b> <b>single</b> questions, they run <b>whole</b> <b>chains</b> of tasks.',
    'They <b>write</b> code, book <b>appointments</b> and <b>control</b> other <b>programs</b>.',
    'For our <b>study</b> we <b>built</b> a <b>closed</b> test <b>environment</b>.',
    '<b>Twelve</b> <b>different</b> agents <b>received</b> <b>realistic</b> office tasks.'
  ]
  var plain = function (s) {
    return s.replace(/<[^>]+>/g, '')
  }
  var i = 2
  function render() {
    var html = ''
    for (var k = i - 2; k <= i + 1 && k < lines.length; k++) {
      if (k < 0) continue
      var cls = k < i ? 'past' : k === i ? 'now' : ''
      html += '<p class="' + cls + '">' + (k === i ? lines[k] : plain(lines[k])) + '</p>'
    }
    stage.innerHTML = html
  }
  var timer = null
  function start() {
    if (timer) return
    timer = setInterval(function () {
      i = i + 1 >= lines.length ? 2 : i + 1
      render()
    }, 2800)
  }
  function stop() {
    clearInterval(timer)
    timer = null
  }
  // Animate only while visible.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries[0].isIntersecting ? start() : stop()
    }).observe(stage)
  } else {
    start()
  }
})()
