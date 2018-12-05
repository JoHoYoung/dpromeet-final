const router = require('express').Router();
const helpers = require('../../helper/helper')
const uuid = require('uuid')
const db = require('../../helper/mysql')
const pool = db.pool
const promiseHandler = require('../../helper/promiseHandler')
const S3 = require('../../helper/awsS3')

/**
 * @swagger
 * tags:
 *   name: post
 *   description: 게시판 관련 API 입니다.
 * definitions:
 *   Todo:
 *     type: object
 *     required:
 *       - content
 *     properties:
 *       _id:
 *         type: string
 *         description: ObjectID
 *       content:
 *         type: string
 *         description: 할일 내용
 *       done:
 *         type: boolean
 *         description: 완료 여부
 */


/**
 * @swagger
 * /list:
 *   post:
 *     summary: 특정 게시판의 게시글 목록을 10개씩 가져옵니다.
 *     tags: [post]
 *     parameters:
 *      - name: post_metaId
 *        in: body
 *        description: 해당 게시판의 metaId
 *        type: array
 *        example: "10fe230121212-dasd123"
 *      - name: page
 *        in: body
 *        description: 게시판의 페이지 번호. 0번부터 시작 각페이지는 게시글 10개씩
 *        type: array
 *        example: "0"
 *     responses:
 *       200:
 *         description: 해당 게시판의 게시글을 10개씩 리턴합니다
 *         properties:
 *           statusCode:
 *             type : integer
 *             example : 200
 *           statusMsg:
 *              type : string
 *              example : "success"
 *           data:
 *              type: array
 *              items:
 *                type: object
 *                properties:
 *                  user_name:
 *                   type: string
 *                  id:
 *                   type: string
 *                  title:
 *                   type: string
 *                  content:
 *                   type: string
 *                  star:
 *                   type: int
 *                  views:
 *                   type: int
 *                  created_date:
 *                   type: string
 *                  updated_date:
 *                   type: string
 *              example:
 *                  - user_name: "호영짱"
 *                    id: hihi
 *                    title: 어제 일을 했습니다.
 *                    content: 내일은 정말 하기 싫네요 내일도 진짜 출근 해야하나요? 튈까요?
 *                    star: 100
 *                    views: 350
 *                    created_date: '2018-01-01'
 *                    updated_date: '2018-01-13'
 *                  - user_name: "호영짱"
 *                    id: hihi
 *                    title: 어제 일을 했습니다.
 *                    content: 내일은 정말 하기 싫네요 내일도 진짜 출근 해야하나요? 튈까요?
 *                    star: 100
 *                    views: 350
 *                    created_date: '2018-01-01'
 *                    updated_date: '2018-01-13'
 *                  - user_name: "호영짱"
 *                    id: hihi
 *                    title: 어제 일을 했습니다.
 *                    content: 내일은 정말 하기 싫네요 내일도 진짜 출근 해야하나요? 튈까요?
 *                    star: 100
 *                    views: 350
 *                    created_date: '2018-01-01'
 *                    updated_date: '2018-01-13'
 *                  - user_name: "호영짱"
 *                    id: hihi
 *                    title: 어제 일을 했습니다.
 *                    content: 내일은 정말 하기 싫네요 내일도 진짜 출근 해야하나요? 튈까요?
 *                    star: 100
 *                    views: 350
 *                    created_date: '2018-01-01'
 *                    updated_date: '2018-01-13'
 *       718:
 *          description: 게시판의 postmetaId가 존재하지 않는경우 에러를 리턴합니다.
 *          properties:
 *            statusCode:
 *              type: integer
 *              example: 718
 *            statusMsg:
 *              type: string
 *              example: "Invalid postmetaId"
 *       716:
 *         description: 토큰이 잘못됐을 경우 에러코드를 리턴합니다.
 *         properties:
 *           statusCode:
 *             type: integer
 *             example: 716
 *           statusMsg:
 *             type: array
 *             example: "Invalid Token"
 *       719:
 *         description: 토큰이 없을 경우 에러코드를 리턴합니다.
 *         properties:
 *           statusCode:
 *             type: integer
 *             example: 716
 *           statusMsg:
 *             type: array
 *             example: "Invalid Token"
 */

router.post('/list', helpers.asyncWrapper(async (req,res) => {

    let conn = await pool.getConnection()
    let post_metaId = req.body.post_metaId
    let offset = parseInt(req.body.page)*10

    let postmetaQ = "SELECT * FROM POST_META WHERE id = '" + post_metaId + "'"
    let postmeta = (await conn.query(postmetaQ))[0][0];

    if(postmeta == null)
    {
        res.json({
            statusCode:718,
            statusMsg:"Invalid postmetaId"
        })
        conn.release()
        return
    }

    //페이지 네이션 처리
    let postQ = "SELECT a.user_name, b.id, b.title, b.content, b.star, b.views, b.created_date, b.updated_date FROM USER a INNER JOIN (SELECT * FROM POST c WHERE postmeta_id = '" + postmeta.id + "'" +
                " AND c.state = 'C' ORDER BY created_date DESC LIMIT " + offset.toString() + ", 10) b on a.id = b.writer_id"
    let post = (await conn.query(postQ))

    res.json({
        statusCode:200,
        statusMsg:"success",
        data: post !== null ? post : null
    })

    conn.release()
    return


}))

let Multiple = S3.uploadArray
router.post('/create',Multiple, helpers.asyncWrapper(async (req,res) => {

    let conn = await pool.getConnection()

    let userId
    if (!req.user) { // No req.user
        res.json({
            statusCode: 719,
            statusMsg:  "No Access Token"
        })
        return null
    } else {
        userId = req.user.userId || null
    }

    let post_metaId = req.body.post_metaId
    let title = req.body.title
    let content = req.body.content

    await conn.query("UPDATE POST_META SET numberofpost +=1 WHERE id = '" + post_metaId + "'")

    let postId = uuid.v4()
    let insertQ = "INSERT INTO POST(id, postmeta_id, title, content, writer_id, state, created_date, updated_date) "+
                    "VALUES(?, ?, ?, ?, ?, 'C', now(), now())"
    await conn.query(insertQ,[postId,post_metaId, title, content, userId])

    for(let i=0;i<req.files.length;i++)
    {
        let createQ = "INSERT INTO POSTIMAGE(id, media_url, post_id, state, created_date, updated_date) "+
                        "VALUES(?, ?, ?, 'C', now(), now())"
        await conn.query(createQ,[uuid.v4(),req.files[i].location, postId])
    }

    res.json({
        statusCode:200,
        statusMsg:"success"
    })
    conn.release()
    return

}))

router.post('/read',helpers.asyncWrapper(async (req,res) => {

    let conn = await pool.getConnection()

    let userId
    if (!req.user) { // No req.user
        res.json({
            statusCode: 719,
            statusMsg:  "No Access Token"
        })
        return null
    } else {
        userId = req.user.userId || null
    }

    let postId = req.body.postId
    let post = (await conn.query("SELECT * FROM POST WHERE id = '" + postId + "'"))[0][0]

    let username = (await conn.query("SELECT user_name FROM USER WHERE id = '" + post.writer_id + "'"))[0][0]

    let ismine
    if(writer_id == userId)
    {
        ismine = true
    }
    else
    {
        ismine=false
    }
    let images = (await conn.query("SELECT * FROM POSTIMAGE WHERE post_id = '" + postId + "' AND state = 'C' "))[0]

    res.json({
        statusCode:200,
        statusMsg:"success",
        data:{
            id: post.id,
            title: post.title,
            content: post.content,
            writer_name: username,
            star: post.star,
            views: post.views,
            created_date: post.created_date,
            updated_date: post.updated_date,
            ismine: ismine,
            images: images
        }
    })
    conn.release()
    return

}))

router.post('/update',Multiple,helpers.asyncWrapper(async (req,res) => {

    let conn = await pool.getConnection()

    let userId
    if (!req.user) { // No req.user
        res.json({
            statusCode: 719,
            statusMsg:  "No Access Token"
        })
        return null
    } else {
        userId = req.user.userId || null
    }

    let postId = req.body.postId
    let title = req.body.title
    let content = req.body.content
    let deletefile = req.body.deletefile

    await conn.query("UPDATE POST SET title = ?, content = ?, updated_date = now() WHERE id = '" + postId + "'",[title,content])

    for(let i=0;i<deletefile.length;i++)
    {
        await conn.query("UPDATE POSTIMAGE SET state = 'D' WHERE id = '" + deletefile[i] + "'")
    }

    for(let j=0;j<req.files.length;j++)
    {
        let createQ = "INSERT INTO POSTIMAGE(id, media_url, post_id, state, created_date, updated_date) "+
            "VALUES(?, ?, ?, 'C', now(), now())"
        await conn.query(createQ,[uuid.v4(),req.files[j].location, postId])
    }

    res.json({
        statusCode:200,
        statusMsg:"success"
    })

    conn.release()
    return

}))

router.post('/delete',helpers.asyncWrapper(async (req,res) => {

    let conn = await pool.getConnection()

    let userId
    if (!req.user) { // No req.user
        res.json({
            statusCode: 719,
            statusMsg:  "No Access Token"
        })
        return null
    } else {
        userId = req.user.userId || null
    }

    let postId = req.body.postId

    let postmeta_Id = (await conn.query("SELECT writer_id ,postmeta_id FROM POST WHERE id = '" + postId + "'"))[0][0]

    if(postId != postmeta_Id.writer_id)
    {
        res.json({
            statusCode: 720,
            statusMsg: "This article is not yours"
        })
        conn.release()
        return
    }

    await conn.query("UDDATE POSTIMAGE SET state ='D' WHERE post_id = '" + postId +"'")
    await conn.query("UPDATE POST_META SET numberofpost -= 1 WHERE id = '" + postmeta_Id.postmeta_Id + "'")
    await conn.query("UPDATE POST SET state ='D' WHERE id = '" + postId + "'")


    res.json({
        statusCode:200,
        statusMsg:"success"
    })
    conn.release()
    return

}))



module.exports = router