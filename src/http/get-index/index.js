const arc = require('@architect/functions')
const fetch = require('node-fetch')
const hljs = require('highlight.js')
const md = require('markdown-it')({
  linkify: true,
  html: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(lang, str).value
      } catch (__) {}
    }
    return ''
  }
})
const nunjucks = require('nunjucks')
nunjucks.configure('views')

const postTypePlurals = [
  'notes',
  'articles',
  'bookmarks',
  'photos',
  'checkins',
  'reposts',
  'likes',
  'replies',
  'rsvps'
]

// Properties that should always remain as arrays
const arrayProperties = [
  'category',
  'syndication',
  'in-reply-to',
  'repost-of',
  'like-of',
  'bookmark-of',
  'comment',
  'like',
  'repost',
  'rsvp',
  'bookmark'
]

const micropubSourceUrl = `${process.env.MICROPUB_URL}?q=source`
const cssPath = arc.static('/style.css')

function flatten (post) {
  for (const key in post) {
    if (Array.isArray(post[key]) && post[key].length === 1 &&
      !arrayProperties.includes(key)) {
      post[key] = post[key][0]
    }
  }
}

function humanDate (dateString) {
  return new Date(dateString).toLocaleString('en-gb', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

async function getIndex () {
  const html = nunjucks.render('index.njk', { cssPath })
  return html
}

async function getPostType (postType, before) {
  let url = `${micropubSourceUrl}&post-type=${postType}`
  if (before) url = url + '&before=' + parseInt(before, 10)
  const response = await fetch(url,
    { headers: { Authorization: `Bearer ${process.env.MICROPUB_TOKEN}` } }
  )
  // console.log(JSON.stringify(response))
  if (!response.ok) return
  const json = await response.json()
  // console.log(json)
  const posts = json.items.map(item => {
    const post = { ...item.properties }
    flatten(post)
    if ('content' in post) {
      if (typeof post.content === 'string') {
        post._contentHtml = md.render(post.content)
      } else {
        post._contentHtml = post.content.html
      }
    }
    post._publishedHuman = humanDate(post.published)
    return post
  })
  const lastPublishedInt = (posts.length === 20)
    ? new Date(posts.slice(-1)[0].published).valueOf()
    : null
  return nunjucks.render('notes.njk', { posts, cssPath, lastPublishedInt })
}

async function getCategory (category, before) {
  let url = `${micropubSourceUrl}&category=${category}`
  if (before) url = url + '&before=' + parseInt(before, 10)
  const response = await fetch(url,
    { headers: { Authorization: `Bearer ${process.env.MICROPUB_TOKEN}` } }
  )
  // console.log(JSON.stringify(response))
  if (!response.ok) return
  const json = await response.json()
  // console.log(json)
  const posts = json.items.map(item => {
    const post = { ...item.properties }
    flatten(post)
    if ('content' in post) {
      if (typeof post.content === 'string') {
        post._contentHtml = md.render(post.content)
      } else {
        post._contentHtml = post.content.html
      }
    }
    post._publishedHuman = humanDate(post.published)
    return post
  })
  // console.log('posts', posts)
  const lastPublishedInt = (posts.length === 20)
    ? new Date(posts.slice(-1)[0].published).valueOf()
    : null
  return nunjucks.render('notes.njk', { posts, cssPath, lastPublishedInt })
}

async function getPost (url) {
  const response = await fetch(
    `${micropubSourceUrl}&url=${process.env.ROOT_URL}${url}`,
    { headers: { Authorization: `Bearer ${process.env.MICROPUB_TOKEN}` } }
  )
  // console.log('micropub response', response)
  const body = await response.json()
  if (!response.ok) { return {
    statusCode: response.status,
    body
  }}
  const post = { ...body.properties }
  flatten(post)
  if ('content' in post) {
    if (typeof post.content === 'string') {
      post._contentHtml = md.render(post.content)
    } else {
      post._contentHtml = post.content.html
    }
  }
  post._publishedHuman = humanDate(post.published)
  // console.log(JSON.stringify(post))
  const postJSON = JSON.stringify(post, null, 2)
  const html = nunjucks.render('note.njk', { post, postJSON, cssPath })
  return {
    statusCode: 200,
    body: html
  }
}

exports.handler = async function http (req) {
  const { before } = req.queryStringParameters || {}
  // strip initial slash, remove any api gateway stage, clean characters
  const url = req.path.substr(1).replace(/^staging\//, '')
    .replace(/[^a-z0-9/-]/, '')
  const htmlHeaders = {
    headers: { 'content-type': 'text/html; charset=utf8' }
  }
  // console.log('url', url)
  // temp reject favicon
  if (url === 'faviconico') {
    return { statusCode: 404 }
  } else if (url.substr(0, 9) === 'category/') {
    const category = url.substr(9, url.length - 9)
    return { ...htmlHeaders, body: await getCategory(category, before) }
  // post types e.g. notes (no trailing slash)
  } else if (postTypePlurals.includes(url)) {
    let postType = url.substr(0, url.length - 1)
    if (postType === 'replie') postType = 'reply'
    return { ...htmlHeaders, body: await getPostType(postType, before) }
  // root is homepage
  } else if (url === '') {
    return { ...htmlHeaders, body: await getIndex() }
  // default, assume a post
  }
  const response = await getPost(url)
  if (response.statusCode !== 200) {
    return {
      ...htmlHeaders,
      statusCode: response.statusCode,
      body: response.body.error_description
    }
  }
  return {
    ...htmlHeaders,
    body: response.body
  }
}
