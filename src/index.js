const https = require('https');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const marked = require('marked');
const core = require('@actions/core');
const github = require('@actions/github');

const PAGE_SIZE = 100;
const extMap = {
  'jpg': 'jpeg',
  'jpeg': 'jpeg',
  'png': 'png',
  'gif': 'gif',
}
let csdn_cookie = "";

//上传图片到CSDN
function uploadPictureToCSDN(filePath) {
    return new Promise((resolve, reject) => {
        const ext = extMap[filePath.split('.').pop().toLowerCase()] || 'png';

        fetch("https://imgservice.csdn.net/direct/v1.0/image/upload?watermark=&type=blog&rtype=markdown", {
          "headers": {
            "content-type": "application/json",
            "x-image-app": "direct_blog",
            "x-image-dir": "direct",
            "x-image-suffix": ext,
            "cookie": csdn_cookie,
            "Referer": "https://editor.csdn.net/",
          }
        }).then(result => result.json())
          .then(result => {
            console.log('get access info:', result);
            if (result.code === 200) {
              const accessId = result.data.accessId;
              const callbackUrl = result.data.callbackUrl;
              const remoteFilePath = result.data.filePath;
              const url = result.data.host;
              const policy = result.data.policy;
              const signature = result.data.signature;

              let formData = new FormData();
              formData.append('key', remoteFilePath);
              formData.append('OSSAccessKeyId', accessId);
              formData.append('policy', policy);
              formData.append('signature', signature);
              formData.append('success_action_status', '200');
              formData.append('callback', callbackUrl);
              formData.append('file', fs.createReadStream(filePath));

              let headers = formData.getHeaders();
              headers.Cookie = csdn_cookie;
              headers["user-agent"] = "Mozilla/5.0";
              headers.Referer = "https://editor.csdn.net/";
              headers.ContentType = 'multipart/form-data';
              headers.Accept = 'application/json';

              // post formData to host
              fetch(url, {
                method: 'POST',
                body: formData,
                headers: headers
              }).then(result => result.json())
                .then(result => {
                  if (result.code === 200) {
                    resolve(result.data.imageUrl)
                  } else {
                    reject('上传图片失败,' + result.msg)
                  }
                })
                .catch(error => {
                  reject('上传图片失败,' + error)
                })
            } else {
              reject('上传图片失败,' + result.msg)
            }
          })
          .catch(error => {
            reject('上传图片失败,' + error)
          })
    })
}

/**
 * 上传文章到CSDN
 * @param {*} title 文章标题
 * @param {*} markdowncontent 全部内容 
 * @param {*} content 摘要
 * @param {*} isPublish true时发布，false时保存草稿
 * @param {*} tags 以逗号隔开
 * @param {*} articleId 为null则创建文章否则更新文章
 * @returns 
 */
function publishArticleToCSDN(title, markdowncontent, content, isPublish, tags, articleId) {
    return new Promise((resolve, reject) => {
        const parms = {
            title: title,
            markdowncontent: markdowncontent,
            content: content,
            readType: "public",
            not_auto_saved: "1",
            source: "pc_mdeditor",
            level: 1
        };
        if(Number(articleId) > 0) {
          parms["id"] = articleId; // 用于更新文章
        }
        if (isPublish) {
            parms['status'] = 0;
            parms['type'] = 'original';
            parms['Description'] = content.toString().substring(0,100);
            parms['authorized_status'] = false;
            parms['categories'] = '';
            parms['original_link'] = '';
            parms['resource_url'] = '';
            parms['tags'] = tags || '经验分享'
        }else {
            parms['status'] = 2
        }
        const json = JSON.stringify(parms);
        let request = https.request({
                                        host: 'blog-console-api.csdn.net',
                                        method: 'POST',
                                        path: '/v1/mdeditor/saveArticle',
                                        headers: {
                                            "content-type": "application/json",
                                            "cookie": csdn_cookie,
                                            "user-agent": "Mozilla/5.0"
                                        }
                                    }, function (res) {
            let str = '';
            res.on('data', function (buffer) {
                       str += buffer;
                   }
            );
            res.on('end', () => {
                const result = JSON.parse(str);
                console.log('saveArticle result:', str);
                if (res.statusCode === 200) {
                    if (result.code === 200) {
                        const url = isPublish ? result.data.url
                                              : 'https://editor.csdn.net/md/?articleId='
                                                + result.data.id;

                        resolve(result.data);
                    } else {
                        reject('发布失败,' + result.msg);
                    }
                } else {
                    reject('发布失败: ' + res.statusCode + '\n'+decodeURI(result.msg))
                }
            });
        });

        request.write(json);
        request.end();

        request.on('error', function (e) {
            reject('网络连接异常'+e.message)
        });
    })
}

async function run() {
	try {
      csdn_cookie = core.getInput('csdn_cookie', { required: true });
      const issue_url = core.getInput('issue_url', { required: true });
      const reg = /\/(\w+)\/(\w+)\/issues\/(\w+)(\/?)$/;
      const owner = issue_url.match(reg)?.[1] || '';
      const repo =  issue_url.match(reg)?.[2] || '';
      const issue_number =  issue_url.match(reg)?.[3] || '';
      const token = core.getInput('token', { required: true });
      let markdowncontent = core.getInput('markdowncontent', { required: false });
      const octokit = github.getOctokit(token);

      console.log('issue:', issue_url, "->" ,owner, repo, issue_number);
      const issue = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
        owner,
        repo,
        issue_number
      });
      const { title, updated_at: updated, labels, number, body: content, created_at: date, html_url }  = issue.data;
      console.log('issue:', JSON.stringify(issue));
      const tags = labels.map((label) => label.name);
      if(!markdowncontent) {
        markdowncontent = content;
      }

      // 通过正则表达式提取csdn-article-id
      const csdn_reg = /<!--csdn-article-id:([1-9]\d*)-->(\/?)/;
      const csdn_tag = markdowncontent.match(csdn_reg)?.[0] || null;
      const articleId = markdowncontent.match(csdn_reg)?.[1] || null;
      console.log(`csdn_tag: ${csdn_tag}, articleId:${articleId}`);
      const article = await publishArticleToCSDN(title, markdowncontent, marked(markdowncontent), true, tags.join(","), articleId);
      console.log(`publishArticleToCSDN result:${article}`);
      // 保存id到issue body里用于更新文章
      if(!csdn_tag && article.id) {
        await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
          owner,
          repo,
          issue_number,
          body:  content + `\n<!--csdn-article-id:${article.id}-->`
        });
      }
	} catch (err) {
		core.setFailed(err);
	}
}
run();