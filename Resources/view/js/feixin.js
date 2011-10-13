dojo.addOnLoad(function () {
    var console = window.console || {
        log: function () {},
        info: function () {},
        error: function () {}
    };

    function Notifier() {

    }
    
    Notifier.prototype.notify = function (icon, title, body,timeout,callback) {
        var popup = Titanium.Notification.createNotification(Titanium.UI.createWindow());
        popup.setIcon(icon);
        popup.setTitle(title);
        popup.setMessage(body);
        popup.setTimeout(timeout || 7000);
        popup.setCallback(callback || function(){
            console.log('Titanium.Notification.Notification');
        });
        popup.show();
        return true;
    }

    var WebFetion = {
        ccpsession:'',
        ssid : '',
        sid: '',
        name:'',
        version : 0,
        loadImage:function(url){
            var path = Titanium.Filesystem.getUserDirectory().toString() + Titanium.Filesystem.getSeparator() + 'code.jpeg';
            var request = Titanium.Network.createHTTPClient();
            request.setTimeout(10000);
            var me = this;
            request.onerror = function(e) {
                console.log('error when loadImage:',e);
            };
            if (request.open('GET', url)) {
                request.receive(function(data) {
                    var file = Titanium.Filesystem.getFile(path);
                    var stream = Titanium.Filesystem.getFileStream(file);
                    stream.open(Titanium.Filesystem.MODE_WRITE);
                    stream.write(data);
                    stream.close();
                    dojo.byId('login_code').src = 'file:///' + path;
                    dojo.byId('login').disabled = false;
                    me.ccpsession = request.getResponseHeader('set-cookie').split(';')[0];
                    console.log('ccpsession:',me.ccpsession);//如果没有catch住"访问未定义的js变量"这种错误就能使Titanium崩溃
                    request = null;
                });
            }
        },
        login: function (e) {
            dojo.stopEvent(e);
            this.post('https://webim.feixin.10086.cn/WebIM/Login.aspx', dojo.mixin(dojo.formToObject('login_form'),{OnlineStatus:400}), dojo.hitch(this, function (json,io) {
                window.localStorage.setItem('name', dojo.trim(dojo.byId('login_form').elements['UserName'].value));
                window.localStorage.setItem('pwd', dojo.trim(dojo.byId('login_form').elements['Pwd'].value));
                if (json.rc === 200) {
                    dojo.fadeOut({
                        node: "login_form",
                        onEnd: function () {
                            dojo.style("login_succ", "display", "");
                        }
                    }).play();
                    this.ssid = io.xhr.getResponseHeader('set-cookie').split('webim_sessionid=')[1].split(';')[0]
                    console.log(io.xhr.getResponseHeader('set-cookie'));
                    this.get_personal_info();
                }
            }),{
                'Cookie':this.ccpsession
            });
        },
        
        //当前登陆用户的飞信号
        get_personal_info: function () {
            var me = this;
            me.post('https://webim.feixin.10086.cn/WebIM/GetPersonalInfo.aspx?Version=' + me.version, {ssid:me.ssid}, function (data) {
                console.log(data)
                if (data.rc === 200) {
                    var rv = data.rv;
                    dojo.style("login_succ", "display", "none");
                    dojo.style("user_info", "display", "");
                    me.name = dojo.byId('name').innerHTML = rv.nn;
                    dojo.byId('nick_name').innerHTML = rv.i;
                    dojo.byId('sid').innerHTML = rv.sid;
                    me.sid = rv.sid;

                    dojo.style("loading", "display", "");
                    me.get_contact_list();
                }
            });
            me.version = me.version + 1;
        },
        get_contact_list: function () {
            var me = this;
            me.post('https://webim.feixin.10086.cn//WebIM/GetContactList.aspx?Version=' + me.version, {ssid:me.ssid}, function (data) {
                console.log(data);
                if (data.rc === 200) {
                    dojo.style("loading", "display", "none");
                    var rv = data.rv;

                    dojo.forEach(rv.bl, function (group) {
                        me.show_group(group);
                    });

                    dojo.forEach(rv.bds, function (buddy) {
                        me.show_contact(buddy);
                    });
                    dojo.byId('contact_list').style.cssText = "width:300px;overflow:hidden;border:solid 1px #1693A5; "

                    //me.keep_alive();
                }
            });
            me.version = me.version + 1;
        },
        status: { //pd
            '0': '隐身',
            '100': '离开',
            '150': '外出就餐',
            '300': '马上回来',
            '365': '离线',
            '400': '在线',
            '500': '接听电话',
            '600': '忙碌',
            '850': '会议中'
        },
        contacts: {},
        icons:{},
        //keep alive through websocket
        keep_alive: function () {
            if (window.WebSocket) {
                var me = this;
                var ws = new WebSocket("ws://host:7777".replace('host', window.location.hostname));
                ws.onopen = function () {
                    console.log('socket opened');
                    ws.send('keep-alive');
                };
                ws.onmessage = function (evt) {
                    var json = evt.data;
                    if (json) {
                        var data;
                        try {
                            data = dojo.fromJson(json);
                        } catch (e) {
                            data = dojo.fromJson('' + json + '');
                        }
                        console.log("ws.onmessage", data);
                        if (data && data.rc === 200) {
                            var rv = data.rv;
                            dojo.forEach(rv, function (item) {
                                if (item.DataType === 2 && item.Data) {
                                    dojo.forEach(document.getElementsByName(item.Data.uid), function (dom) {
                                        if (me.status[item.Data.pb] !== undefined) {
                                            dom.innerHTML = " --- " + me.status[item.Data.pb];
                                        }
                                        //i是签名，nn是名称，mn手机号
                                        dom.parentNode.title = [item.Data.i, item.Data.mn, item.Data.uri].join(" ");
                                        if (item.Data.nn) {
                                            me.contacts[item.Data.uid] = item.Data.nn;
                                            dom.parentNode.children[0].innerHTML = item.Data.nn;
                                            dom.parentNode.setAttribute("nick", item.Data.nn);
                                        }
                                        if (item.Data.crc) {
                                            var img = document.createElement("img");
                                            me.icons[item.Data.uid] = img.src = me.template("http://webim.feixin.10086.cn/WebIM/GetPortrait.aspx?did=#{uid}&Size=3&Crc=#{crc}&mid=#{uid}", {
                                                uid: item.Data.uid,
                                                crc: item.Data.crc
                                            });
                                            img.style.cssText = "width:20px;height:20px;";
                                            dom.parentNode.insertBefore(img, dom.parentNode.children[0]);
                                        }
                                    });
                                }
                                if (item.DataType === 3 && item.Data) {
                                    var msg = (me.contacts[item.Data.fromUid] || item.Data.fromUid) + " 对你说： " + item.Data.msg + " (" +(new Date()).toString() + ")";
                                    try {
                                        notifier.notify(me.icons[item.Data.fromUid] || (window.location.href + "images/feixin.png"), "飞信新消息:", msg);
                                    } catch (e) {
                                        alert(msg);
                                    }
                                    me.save_history(item.Data.fromUid, msg);
                                    me.show_chat_dialog(item.Data.fromUid, me.contacts[item.Data.fromUid] || item.Data.fromUid);
                                }
                            });
                        }
                    }
                };
                ws.onerror = function () {
                    console.info(arguments)
                };
                ws.onclose = function () {
                    console.log('socket closed');
                };
            }
        },
        send_msg: function (to, msg, isSendSms) {
            this.post('send_msg', {
                'to': to,
                'msg': msg,
                'isSendSms': isSendSms ? '1' : '0'
            }, function (json) {
                var data;
                try {
                    data = dojo.fromJson(json);
                } catch (e) {
                    data = dojo.fromJson('' + json + '');
                }
                console.log(data);
                if (data.rc === 200) {
                    notifier.notify(window.location.href + "images/feixin.png", "消息发送结果:", '发送成功！');
                }else{
                    notifier.notify(window.location.href + "images/feixin.png", "消息发送结果:", '发送失败！请重新发送。');
                }
            });
        },
        get: function (url, data, callback, timeout) {
            dojo.xhrGet({
                url: url,
                content: data,
                load: callback,
                error: function () {
                    //console.error(arguments);
                }
            });
        },
        post: function (url, data, callback,headers) {
            headers = headers || {};
            dojo.xhrPost({
                url: url,
                handleAs: 'json',
                load: callback,
                content: data,
                error: function () {
                    console.error(arguments);
                },
                headers: dojo.mixin({ 
                    "Content-Type":"application/x-www-form-urlencoded; charset=utf-8",
                    'Referer' : 'https://webim.feixin.10086.cn/'
                },headers)
            });

        },
        
        template: function (tmpl, data) {
            return tmpl.replace(/(#\{(.*?)\})/g, function () {
                return data[arguments[2]] || "";
            });
        },
        show_group: function (group) {
            var dom = document.createElement('li');
            var tmpl = '<div><a style="color:#FBB829;cursor:pointer;" herf="javascript:void(0);" id="group_#{id}">#{name}</a></div>\
            <ul id="group_#{id}_contactlist">\
            </ul>';

            dom.innerHTML = this.template(tmpl, {
                id: group.id,
                name: group.n
            });
            dojo.byId('contact_list').appendChild(dom);
            var el = dojo.byId("group_" + group.id + "_contactlist");
            dojo.connect(dojo.byId("group_" + group.id), 'click', function () {
                el.style.display = el.style.display === "none" ? "" : "none";
            });
        },
        show_contact: function (contact) {
            var dom = document.createElement('li');
            var tmpl = '<a style="color:#1693A5;" herf="javascript:void(0);" uid="#{uid}" uri="#{uri}">#{name}</a>\
		    <span name="#{uid}" style="color:#F46B8D;"></span>';

            dom.innerHTML = this.template(tmpl, {
                name: contact.ln || contact.uid,
                uid: contact.uid,
                uri: contact.uri
            });
            dojo.connect(dom, 'click', this, function () {
                this.show_chat_dialog(contact.uid, dom.getAttribute('nick') || contact.ln || contact.uid);
            });
            var list = dojo.byId('group_' + contact.bl + '_contactlist');
            if (list) {
                list.appendChild(dom);
            }
        },
        show_chat_dialog: function (to, name) {
            dojo.byId('chatwindow').style.display = "";
            dojo.byId('peer').innerHTML = "和 #" + name + "# 聊天：";
            this.load_history(to);

            var content = dojo.byId('chat_content');
            content.focus();
            var me = this;

            function sendMessage() {
                var msg = me.trim(content.value);
                if (msg) {
                    me.send_msg(to, msg, dojo.byId('chat_checkbox').checked);
                    msg = me.name + " 对 " + name + " 说：" + msg + " (" +(new Date()).toString() + ")";
                    me.save_history(to, msg);

                    setTimeout(function () {
                        content.value = "";
                        me.load_history(to);
                    }, 300);
                } else {
                    content.style.backgroundColor = "yellow";
                    setTimeout(function () {
                        content.style.backgroundColor = "";
                    }, 500);
                }
                return false;
            }

            function enterSubmit(e) {
                if (e.keyCode === 13 || e.which === 13 || e.charCode === 13) {
                    if (!e.ctrlKey) { //enter提交
                        sendMessage();
                        dojo.stopEvent(e); //不换行就提交
                    }
                }
            }

            dojo.forEach(me.handles, function (h) { //必须先解除这些绑定
                dojo.disconnect(h);
            });
            me.handles.push(dojo.connect(content, 'keydown', enterSubmit)); //拼音输入法enter不提交（keyup会提交）
            me.handles.push(dojo.connect(dojo.byId('send_msg'), "click", function () {
                sendMessage();
            }));
        },
        handles: [],
        trim: function (str) {
            return str.replace(/(\u3000|\s|\t)*$/gi, "").replace(/^(\u3000|\s|\t)*/gi, "");
        },
        load_history: function (peer_uid) {
            dojo.byId('chat_history').innerHTML = "";
            var key = "web_fetion_" + peer_uid;
            var history = dojo.byId('chat_history');
            var his = window.localStorage.getItem(key) || "";
            dojo.forEach(his.split("###"), function (item) {
                if (item) {
                    var dom = document.createElement("LI");
                    dom.innerHTML = item;
                    history.appendChild(dom);
                }
            });
            var pNode = history.parentNode;
            pNode.scrollTop = pNode.scrollHeight;
        },
        save_history: function (peer_uid, msg) {
            var key = "web_fetion_" + peer_uid;
            window.localStorage.setItem(key, [window.localStorage.getItem(key), msg].join("###"));
        },
        email_history: function () {

        }
    };
    dojo.connect(dojo.byId('login'), 'click', WebFetion, 'login');
    WebFetion.loadImage('https://webim.feixin.10086.cn/WebIM/GetPicCode.aspx?Type=ccpsession&'+ Math.random());
    
    dojo.byId('login_form').elements['UserName'].value = '';
    dojo.byId('login_form').elements['Pwd'].value = '';
    
    if (window.localStorage) {
        var elements = dojo.byId('login_form').elements;
        if(window.localStorage.getItem('name')){
            elements['UserName'].value = window.localStorage.getItem('name');
        } 
        if(window.localStorage.getItem('pwd')){
            elements['Pwd'].value = window.localStorage.getItem('pwd') ;
        }
        
    }
});