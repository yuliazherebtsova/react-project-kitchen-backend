var router = require('express').Router();
var mongoose = require('mongoose');
var Article = mongoose.model('Article');
var Comment = mongoose.model('Comment');
var User = mongoose.model('User');
var auth = require('../auth');

// Preload article objects on routes with ':article'
router.param('article', function (req, res, next, slug) {
  Article.findOne({ slug: slug })
    .populate('author')
    .then(function (article) {
      if (!article) {
        return res.sendStatus(404);
      }

      req.article = article;

      return next();
    })
    .catch(next);
});

router.param('comment', function (req, res, next, id) {
  Comment.findById(id)
    .then(function (comment) {
      if (!comment) {
        return res.sendStatus(404);
      }

      req.comment = comment;

      return next();
    })
    .catch(next);
});

router.get('/', auth.optional, function (req, res, next) {
  /* #swagger.responses[200] = {
            description: 'Articles successfully loaded.',
            schema: { 
              articles: {
                $ref: "#/definitions/Articles",
              },
              articlesCount: 1
            }
    }
    #swagger.parameters['limit'] = {
            in: 'query',
            description: 'Max articles count on page',
            required: false,
    }
    #swagger.parameters['offset'] = {
            in: 'query',
            description: 'Pagination offset parameter',
            required: false,
    } 
    #swagger.parameters['author'] = {
            in: 'query',
            description: 'Username',
            required: false,
    }
    #swagger.parameters['favorited'] = {
            in: 'query',
            description: 'Username',
            required: false,
    }
    #swagger.parameters['tag'] = {
            in: 'query',
            description: 'Tag',
            required: false,
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Загрузить (отфильтровать) список статей [на фронте - getArticlesBy()]'
    #swagger.auto = false
  */
  var query = {};
  var limit = 20;
  var offset = 0;

  if (typeof req.query.limit !== 'undefined') {
    limit = req.query.limit;
  }

  if (typeof req.query.offset !== 'undefined') {
    offset = req.query.offset;
  }

  if (typeof req.query.tag !== 'undefined') {
    query.tagList = { $in: [req.query.tag] };
  }

  Promise.all([
    req.query.author ? User.findOne({ username: req.query.author }) : null,
    req.query.favorited
      ? User.findOne({ username: req.query.favorited })
      : null,
  ])
    .then(function (results) {
      var author = results[0];
      var favoriter = results[1];

      if (author) {
        query.author = author._id;
      }

      if (favoriter) {
        query._id = { $in: favoriter.favorites };
      } else if (req.query.favorited) {
        query._id = { $in: [] };
      }

      return Promise.all([
        Article.find(query)
          .limit(Number(limit))
          .skip(Number(offset))
          .sort({ createdAt: 'desc' })
          .populate('author')
          .exec(),
        Article.count(query).exec(),
        req.payload ? User.findById(req.payload.id) : null,
      ]).then(function (results) {
        var articles = results[0];
        var articlesCount = results[1];
        var user = results[2];

        return res.json({
          articles: articles.map(function (article) {
            return article.toJSONFor(user);
          }),
          articlesCount: articlesCount,
        });
      });
    })
    .catch(next);
});

router.get('/feed', auth.required, function (req, res, next) {
  /* #swagger.responses[200] = {
            description: 'Feed successfully loaded.',
            schema: { 
              articles: {
                $ref: "#/definitions/Articles",
              },
              articlesCount: 1
            }
    } 
    #swagger.security = [{
              "bearerAuth": []
    }]
    #swagger.parameters['authorization'] = {
                in: 'headers',
                description: 'Token',
                required: true,
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Загрузить ленту [на фронте - getFeed()]'
  */
  var limit = 20;
  var offset = 0;

  if (typeof req.query.limit !== 'undefined') {
    limit = req.query.limit;
  }

  if (typeof req.query.offset !== 'undefined') {
    offset = req.query.offset;
  }

  User.findById(req.payload.id).then(function (user) {
    if (!user) {
      return res.sendStatus(401);
    }

    Promise.all([
      Article.find({ author: { $in: user.following } })
        .limit(Number(limit))
        .skip(Number(offset))
        .populate('author')
        .exec(),
      Article.count({ author: { $in: user.following } }),
    ])
      .then(function (results) {
        var articles = results[0];
        var articlesCount = results[1];

        return res.json({
          articles: articles.map(function (article) {
            return article.toJSONFor(user);
          }),
          articlesCount: articlesCount,
        });
      })
      .catch(next);
  });
});

router.post('/', auth.required, function (req, res, next) {
  /* #swagger.responses[200] = {
            description: 'Artiсle successfully created.',
            schema: { 
              article: { $ref: "#/definitions/Article" }
            }
    } 
    #swagger.parameters['article'] = {
                in: 'body',
                description: 'Article content',
                required: true,
                schema: {
                  article: {
                    "title": "title",
                    "description": "about my acticle",
                    "body": "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor",
                    "tagList": [
                        "tag1",
                        "tag2"
                    ],
                  }
                }
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Добавить новую статью [на фронте - createArticle()]'
    #swagger.auto = false
  */
  User.findById(req.payload.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
      }

      var article = new Article(req.body.article);

      article.author = user;

      return article.save().then(function () {
        console.log(article.author);
        return res.json({ article: article.toJSONFor(user) });
      });
    })
    .catch(next);
});

// return a article
router.get('/:article', auth.optional, function (req, res, next) {
  /* #swagger.responses[200] = {
            description: 'Artiсle successfully loaded.',
            schema: { 
              article: { $ref: "#/definitions/Article" }
            }
    } 
    #swagger.parameters['article'] = {
                in: 'path',
                description: 'Article slug',
                required: true,
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Загрузить статью [на фронте - getArticle()]'
    #swagger.auto = false
  */
  Promise.all([
    req.payload ? User.findById(req.payload.id) : null,
    req.article.populate('author').execPopulate(),
  ])
    .then(function (results) {
      var user = results[0];

      return res.json({ article: req.article.toJSONFor(user) });
    })
    .catch(next);
});

// update article
router.put('/:article', auth.required, function (req, res, next) {
    /* #swagger.responses[200] = {
            description: 'Artiсle successfully updated.',
            schema: { $ref: "#/definitions/Article" }
    } 
    #swagger.security = [{
              "bearerAuth": []
    }]
    #swagger.parameters['authorization'] = {
                in: 'headers',
                description: 'Token',
                required: true,
    }
    #swagger.parameters['article'] = {
                in: 'path',
                description: 'Article slug',
                required: true,
    }
    #swagger.parameters['article'] = {
                in: 'body',
                description: 'Article content',
                required: true,
                schema: {
                  article: {
                    "title": "New article title!",
                    "description": "New info about my acticle",
                    "body": "New lorLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor",
                    "tagList": [
                        "tag1",
                        "tag2",
                        "new_tag!"
                    ],
                  }
                }
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Отредактировать статью [на фронте - updateArticle()]'
    #swagger.auto = false
  */
  User.findById(req.payload.id).then(function (user) {
    if (req.article.author._id.toString() === req.payload.id.toString()) {
      if (typeof req.body.article.title !== 'undefined') {
        req.article.title = req.body.article.title;
      }

      if (typeof req.body.article.description !== 'undefined') {
        req.article.description = req.body.article.description;
      }

      if (typeof req.body.article.body !== 'undefined') {
        req.article.body = req.body.article.body;
      }

      if (typeof req.body.article.tagList !== 'undefined') {
        req.article.tagList = req.body.article.tagList;
      }

      req.article
        .save()
        .then(function (article) {
          return res.json({ article: article.toJSONFor(user) });
        })
        .catch(next);
    } else {
      return res.sendStatus(403);
    }
  });
});

// delete article
router.delete('/:article', auth.required, function (req, res, next) {
    /* #swagger.responses[204] = {
            description: 'Artiсle successfully deleted.',
    } 
    #swagger.security = [{
              "bearerAuth": []
    }]
    #swagger.parameters['authorization'] = {
                in: 'headers',
                description: 'Token',
                required: true,
    }
    #swagger.parameters['article'] = {
                in: 'path',
                description: 'Article slug',
                required: true,
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Удалить статью [на фронте - deleteArticle()]'
    #swagger.auto = false
  */
  User.findById(req.payload.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
      }

      if (req.article.author._id.toString() === req.payload.id.toString()) {
        return req.article.remove().then(function () {
          return res.sendStatus(204);
        });
      } else {
        return res.sendStatus(403);
      }
    })
    .catch(next);
});

// Favorite an article
router.post('/:article/favorite', auth.required, function (req, res, next) {
  /* #swagger.responses[200] = {
            description: 'Artiсle successfully favorited.',
            schema: { $ref: "#/definitions/FavoritedArticle" }
    } 
    #swagger.security = [{
              "bearerAuth": []
    }]
    #swagger.parameters['authorization'] = {
                in: 'headers',
                description: 'Token',
                required: true,
    }
    #swagger.parameters['article'] = {
                in: 'path',
                description: 'Article slug',
                required: true,
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Добавить статью в избранное [на фронте - favoriteArticle()]'
    #swagger.auto = false
  */
  var articleId = req.article._id;

  User.findById(req.payload.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
      }

      return user.favorite(articleId).then(function () {
        return req.article.updateFavoriteCount().then(function (article) {
          return res.json({ article: article.toJSONFor(user) });
        });
      });
    })
    .catch(next);
});

// Unfavorite an article
router.delete('/:article/favorite', auth.required, function (req, res, next) {
  /* #swagger.responses[200] = {
            description: 'Artiсle successfully unfavorited.',
            schema: { $ref: "#/definitions/Article" }
    } 
    #swagger.security = [{
              "bearerAuth": []
    }]
    #swagger.parameters['authorization'] = {
                in: 'headers',
                description: 'Token',
                required: true,
    }
    #swagger.parameters['article'] = {
                in: 'path',
                description: 'Article slug',
                required: true,
                schema: {
                  slug: "name-888ugh"
                }
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Убрать статью из избранного [на фронте - unfavoriteArticle()]'
    #swagger.auto = false
  */
  var articleId = req.article._id;

  User.findById(req.payload.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
      }

      return user.unfavorite(articleId).then(function () {
        return req.article.updateFavoriteCount().then(function (article) {
          return res.json({ article: article.toJSONFor(user) });
        });
      });
    })
    .catch(next);
});

// return an article's comments
router.get('/:article/comments', auth.optional, function (req, res, next) {
  /* #swagger.responses[200] = {
            description: 'Comments successfully loaded.',
            schema: { $ref: "#/definitions/Comments" }
    } 
    #swagger.parameters['article'] = {
                in: 'path',
                description: 'Article slug',
                required: true,
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Получить комментарии к статье [на фронте - getComments()]'
    #swagger.auto = false
  */
  Promise.resolve(req.payload ? User.findById(req.payload.id) : null)
    .then(function (user) {
      return req.article
        .populate({
          path: 'comments',
          populate: {
            path: 'author',
          },
          options: {
            sort: {
              createdAt: 'desc',
            },
          },
        })
        .execPopulate()
        .then(function (article) {
          return res.json({
            comments: req.article.comments.map(function (comment) {
              return comment.toJSONFor(user);
            }),
          });
        });
    })
    .catch(next);
});

// create a new comment
router.post('/:article/comments', auth.required, function (req, res, next) {
  /* #swagger.responses[200] = {
            description: 'Comment successfully created.',
            schema: { $ref: "#/definitions/Comment" }
    } 
    #swagger.security = [{
              "bearerAuth": []
    }]
    #swagger.parameters['authorization'] = {
                in: 'headers',
                description: 'Token',
                required: true,
    }
    #swagger.parameters['article'] = {
                in: 'path',
                description: 'Article slug',
                required: true,
    }
    #swagger.parameters['comment'] = {
                in: 'body',
                description: 'Comment text',
                required: true,
                schema: {
                    body: "Awesome comment about anything!"
                }
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Добавить комментарий к статье [на фронте - addComment()]'
    #swagger.auto = false
  */
  User.findById(req.payload.id)
    .then(function (user) {
      if (!user) {
        return res.sendStatus(401);
      }

      var comment = new Comment(req.body.comment);
      comment.article = req.article;
      comment.author = user;

      return comment.save().then(function () {
        req.article.comments.push(comment);

        return req.article.save().then(function (article) {
          res.json({ comment: comment.toJSONFor(user) });
        });
      });
    })
    .catch(next);
});

router.delete(
  '/:article/comments/:comment',
  auth.required,
  function (req, res, next) {
    /* #swagger.responses[204] = {
            description: 'Comment successfully deleted.',
    } 
    #swagger.security = [{
              "bearerAuth": []
    }]
    #swagger.parameters['authorization'] = {
                in: 'headers',
                description: 'Token',
                required: true,
    }
    #swagger.parameters['article'] = {
                in: 'path',
                description: 'Article slug',
                required: true,
    }
    #swagger.parameters['comment'] = {
                in: 'path',
                description: 'Comment id',
                required: true,
                }
    }
    #swagger.tags = ['Article']
    #swagger.summary = 'Удалить комментарий к статье [на фронте - deleteComment()]'
    #swagger.auto = false
    */

    if (req.comment.author.toString() === req.payload.id.toString()) {
      req.article.comments.remove(req.comment._id);
      req.article
        .save()
        .then(Comment.find({ _id: req.comment._id }).remove().exec())
        .then(function () {
          res.sendStatus(204);
        });
    } else {
      res.sendStatus(403);
    }
  },
);

module.exports = router;
