/* DOM generator class start */
    class SCDOM
    {
        createElement([{tag=false, attr={}, children=false, event={}}])
        {
            let elements='';
            if(tag)
            {
                /* make tag start -------------------*/
                    elements = document.createElement(tag);
                /* make tag end ---------------------*/


                /* set attribute to created element end ---------------------*/
                    let attrArr  = Object.entries(attr);
                    attrArr.forEach(([attrName, attrValue])=>
                    {
                        elements.setAttribute(attrName, attrValue);
                    });
                /* set attribute to created element end ---------------------*/


                /* set eventListener to created element start ---------------*/
                    let eventArr  = Object.entries(event);
                    eventArr.forEach(([eventName, event])=>
                    {
                        elements.addEventListener(eventName, event);
                    });
                /* set eventListener to created element end------------------*/
            }


            /* work with children start --------------*/
                if(children)
                {
                    if(Array.isArray(children))
                    {
                        children.forEach(child=>
                        {
                            if(typeof child==='string')
                            {
                                elements.innerHTML = child;
                            }else{
                                this.append(elements, this.createElement([child]));
                            }
                        });
                    }
                    else if(typeof children === 'string')
                    {
                        elements.innerHTML = children;
                    }else{
                        console.log('Child should pass as array or String !');
                    }
                }
            /* work with children end ----------------*/

            return elements;
        }

        append(root, element){
            root.append(element);
            return this;
        }

        prepend(root, element){
            root.prepend(element);
            return this;
        }

        removeElement(element){
            element.remove();
            return this;
        }

        insertBefore(referenceNode, newNode){
            referenceNode.parentElement.insertBefore(newNode, referenceNode);
            return this;
        }

        insertAfter(referenceNode, newNode)
        {
            referenceNode.after(newNode);
            return this;
        }

        replaceWith(targetElement, newElement)
        {
            targetElement.replaceWith(newElement);
        }
        replaceWithChild(oldChild, newChild)
        {
            oldChild.parentElement.replaceChild(newChild, oldChild);
        }
        replaceWithChildren(parent, newChild)
        {
            console.log(parent, newChild);
            return;
            parent.replaceChildren(newChild);
        }
    }
/* DOM generator class end */


/* notification generator start */
    {
    const _dom = new SCDOM();

        /* make alert main wraper start -------------------*/
            let sc_notification_wraper = _dom.createElement([
                {
                    tag:'div', 
                    attr:{class:"sc_notification_wraper"}
                }
            ]);
            _dom.append(document.body, sc_notification_wraper);
        /* make alert main wraper end ---------------------*/

        class SCNotification
        {
            constructor({design='default', title='Alert!', msg='This is default alert from system!'})
            {
                this.wraper = sc_notification_wraper;
                this.design = design;
                this.title = title;
                this.msg = msg;
                this.waitingTime = '5s';
                this.notification;

                this.icons = {
                    'primary': `<span class="sc_icon">
                                    <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                        <g>
                                            <polygon points="288,448 288,192 192,192 192,208 224,208 224,448 192,448 192,464 320,464 320,448 	"></polygon>
                                            <path d="M255.8,144.5c26.6,0,48.2-21.6,48.2-48.2s-21.6-48.2-48.2-48.2c-26.6,0-48.2,21.6-48.2,48.2S229.2,144.5,255.8,144.5z"></path>
                                        </g>
                                    </svg>
                                </span>`,
                    'secondary': `<span class="sc_icon">
                                    <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                        <g>
                                            <polygon points="288,448 288,192 192,192 192,208 224,208 224,448 192,448 192,464 320,464 320,448 	"></polygon>
                                            <path d="M255.8,144.5c26.6,0,48.2-21.6,48.2-48.2s-21.6-48.2-48.2-48.2c-26.6,0-48.2,21.6-48.2,48.2S229.2,144.5,255.8,144.5z"></path>
                                        </g>
                                    </svg>
                                </span>`,
                    'success': `<span class="sc_icon">
                                    <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                        <path d="M461.6,109.6l-54.9-43.3c-1.7-1.4-3.8-2.4-6.2-2.4c-2.4,0-4.6,1-6.3,2.5L194.5,323c0,0-78.5-75.5-80.7-77.7
                                        c-2.2-2.2-5.1-5.9-9.5-5.9c-4.4,0-6.4,3.1-8.7,5.4c-1.7,1.8-29.7,31.2-43.5,45.8c-0.8,0.9-1.3,1.4-2,2.1c-1.2,1.7-2,3.6-2,5.7
                                        c0,2.2,0.8,4,2,5.7l2.8,2.6c0,0,139.3,133.8,141.6,136.1c2.3,2.3,5.1,5.2,9.2,5.2c4,0,7.3-4.3,9.2-6.2L462,121.8
                                        c1.2-1.7,2-3.6,2-5.8C464,113.5,463,111.4,461.6,109.6z"></path>
                                    </svg>
                                </span>`,
                    'warning': `<span class="sc_icon">
                                    <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                        <g>
                                            <path d="M320,480H192v-96h128V480z M304,320h-96L192,32h128L304,320z"></path>
                                        </g>
                                    </svg>
                                </span>`,
                    'danger': `<span class="sc_icon">
                                    <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor"><path d="M443.6,387.1L312.4,255.4l131.5-130c5.4-5.4,5.4-14.2,0-19.6l-37.4-37.6c-2.6-2.6-6.1-4-9.8-4c-3.7,0-7.2,1.5-9.8,4
                                            L256,197.8L124.9,68.3c-2.6-2.6-6.1-4-9.8-4c-3.7,0-7.2,1.5-9.8,4L68,105.9c-5.4,5.4-5.4,14.2,0,19.6l131.5,130L68.4,387.1
                                            c-2.6,2.6-4.1,6.1-4.1,9.8c0,3.7,1.4,7.2,4.1,9.8l37.4,37.6c2.7,2.7,6.2,4.1,9.8,4.1c3.5,0,7.1-1.3,9.8-4.1L256,313.1l130.7,131.1
                                            c2.7,2.7,6.2,4.1,9.8,4.1c3.5,0,7.1-1.3,9.8-4.1l37.4-37.6c2.6-2.6,4.1-6.1,4.1-9.8C447.7,393.2,446.2,389.7,443.6,387.1z"></path>
                                    </svg>
                                </span>`,
                    'default': `<span class="sc_icon">
                                    <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                        <g>
                                            <polygon points="288,448 288,192 192,192 192,208 224,208 224,448 192,448 192,464 320,464 320,448 	"></polygon>
                                            <path d="M255.8,144.5c26.6,0,48.2-21.6,48.2-48.2s-21.6-48.2-48.2-48.2c-26.6,0-48.2,21.6-48.2,48.2S229.2,144.5,255.8,144.5z"></path>
                                        </g>
                                    </svg>
                                </span>`
                };

                this.types = {
                    'primary': `sc_primary`,
                    'secondary': `sc_secondary`,
                    'success': `sc_success`,
                    'warning': `sc_warning`,
                    'danger': `sc_danger`,
                    'default': ``
                };

                this.generateNotification();
            }

            generateNotification()
            {
                this.notification = _dom.createElement([{
                    tag: 'div',
                    attr: {
                        class: `sc_notification ${ this.types[this.design] }`,
                        style: `--delay: ${this.waitingTime}`
                    },

                    children: [

                        // left part
                        {
                            tag: 'div',
                            attr: {
                                class: 'sc_icon_text'
                            },
                            children: [

                                // left icon
                                this.icons[this.design],
                                
                                // middle text part
                                {
                                    tag: 'div',
                                    attr: {
                                        class: 'sc_text'
                                    },
                                    children: [
                                        // title
                                        {
                                            tag: 'h4',
                                            attr: {
                                                class: 'sc_title'
                                            },
                                            children: this.title
                                        },
                                        // msg
                                        {
                                            tag: 'p',
                                            attr: {
                                                class: 'sc_msg'
                                            },
                                            children: this.msg
                                        }
                                    ]
                                }
                            ]
                        },

                        // close icon
                        {
                            tag: 'span',
                            attr: {
                                class: 'sc_close'
                            },
                            event: {
                                'click': ()=>{this.closeEvent(this);}
                            },
                            children: `<svg x="0px"  y="0px" width="15px" height="15px" viewBox="0 0 512 512" style="fill: currentColor">
                                            <path d="M437.5,386.6L306.9,256l130.6-130.6c14.1-14.1,14.1-36.8,0-50.9c-14.1-14.1-36.8-14.1-50.9,0L256,205.1L125.4,74.5
                                            c-14.1-14.1-36.8-14.1-50.9,0c-14.1,14.1-14.1,36.8,0,50.9L205.1,256L74.5,386.6c-14.1,14.1-14.1,36.8,0,50.9
                                            c14.1,14.1,36.8,14.1,50.9,0L256,306.9l130.6,130.6c14.1,14.1,36.8,14.1,50.9,0C451.5,423.4,451.5,400.6,437.5,386.6z" />
                                        </svg>`
                        }
                    ]
                }]);

                _dom.append(this.wraper, this.notification);

                // this line helps css animation
                this.notification.style.height = this.notification.offsetHeight+'px';


                // this event listener detect the animation end
                this.notification.addEventListener('animationend', (e)=>
                {
                    if(e.animationName === 'sc_notification_timeDown')
                    {
                        this.closeNotification(this.notification);
                    }

                    if(e.animationName === 'sc_notification_close')
                    {
                        this.notification.remove();
                    }
                });
                
            }

            closeEvent(){
                this.closeNotification();
            }

            closeNotification(){
                this.notification.classList.add('sc_close_animation');
            }
        }



        function msg(param={})
        {
            new SCNotification(param);
        }
    };
/* notification generator end */



/* alert, confirm box and prompt script start */
    {
        let _dom = new SCDOM();
        class SCALERTMSG{
            constructor({title, msg='', status, type, defaultValue}, callBack=false)
            {
                this.title=title;
                this.msg=msg;
                this.status=status;
                this.type=type;
                this.defaultValue=defaultValue;
                this.callBack = callBack;
                this.sc_confirmation_wraper;
                this.sc_content_box;
                this.sc_content_body;
                this.sc_content_footer;
                this.promptInput;

                this.icons = {
                                'primary': `<span class="sc_icon">
                                                <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                                    <g>
                                                        <polygon points="288,448 288,192 192,192 192,208 224,208 224,448 192,448 192,464 320,464 320,448 	"></polygon>
                                                        <path d="M255.8,144.5c26.6,0,48.2-21.6,48.2-48.2s-21.6-48.2-48.2-48.2c-26.6,0-48.2,21.6-48.2,48.2S229.2,144.5,255.8,144.5z"></path>
                                                    </g>
                                                </svg>
                                            </span>`,
                                'secondary': `<span class="sc_icon">
                                                <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                                    <g>
                                                        <polygon points="288,448 288,192 192,192 192,208 224,208 224,448 192,448 192,464 320,464 320,448 	"></polygon>
                                                        <path d="M255.8,144.5c26.6,0,48.2-21.6,48.2-48.2s-21.6-48.2-48.2-48.2c-26.6,0-48.2,21.6-48.2,48.2S229.2,144.5,255.8,144.5z"></path>
                                                    </g>
                                                </svg>
                                            </span>`,
                                'success': `<span class="sc_icon">
                                                <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                                    <path d="M461.6,109.6l-54.9-43.3c-1.7-1.4-3.8-2.4-6.2-2.4c-2.4,0-4.6,1-6.3,2.5L194.5,323c0,0-78.5-75.5-80.7-77.7
                                                    c-2.2-2.2-5.1-5.9-9.5-5.9c-4.4,0-6.4,3.1-8.7,5.4c-1.7,1.8-29.7,31.2-43.5,45.8c-0.8,0.9-1.3,1.4-2,2.1c-1.2,1.7-2,3.6-2,5.7
                                                    c0,2.2,0.8,4,2,5.7l2.8,2.6c0,0,139.3,133.8,141.6,136.1c2.3,2.3,5.1,5.2,9.2,5.2c4,0,7.3-4.3,9.2-6.2L462,121.8
                                                    c1.2-1.7,2-3.6,2-5.8C464,113.5,463,111.4,461.6,109.6z"></path>
                                                </svg>
                                            </span>`,
                                'warning': `<span class="sc_icon">
                                                <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                                    <g>
                                                        <path d="M320,480H192v-96h128V480z M304,320h-96L192,32h128L304,320z"></path>
                                                    </g>
                                                </svg>
                                            </span>`,
                                'danger': `<span class="sc_icon">
                                                <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor"><path d="M443.6,387.1L312.4,255.4l131.5-130c5.4-5.4,5.4-14.2,0-19.6l-37.4-37.6c-2.6-2.6-6.1-4-9.8-4c-3.7,0-7.2,1.5-9.8,4
                                                        L256,197.8L124.9,68.3c-2.6-2.6-6.1-4-9.8-4c-3.7,0-7.2,1.5-9.8,4L68,105.9c-5.4,5.4-5.4,14.2,0,19.6l131.5,130L68.4,387.1
                                                        c-2.6,2.6-4.1,6.1-4.1,9.8c0,3.7,1.4,7.2,4.1,9.8l37.4,37.6c2.7,2.7,6.2,4.1,9.8,4.1c3.5,0,7.1-1.3,9.8-4.1L256,313.1l130.7,131.1
                                                        c2.7,2.7,6.2,4.1,9.8,4.1c3.5,0,7.1-1.3,9.8-4.1l37.4-37.6c2.6-2.6,4.1-6.1,4.1-9.8C447.7,393.2,446.2,389.7,443.6,387.1z"></path>
                                                </svg>
                                            </span>`,
                                'default': `<span class="sc_icon">
                                                <svg x="0px" y="0px" width="16px" height="16px" viewBox="0 0 512 512" style="fill: currentColor">
                                                    <g>
                                                        <polygon points="288,448 288,192 192,192 192,208 224,208 224,448 192,448 192,464 320,464 320,448 	"></polygon>
                                                        <path d="M255.8,144.5c26.6,0,48.2-21.6,48.2-48.2s-21.6-48.2-48.2-48.2c-26.6,0-48.2,21.6-48.2,48.2S229.2,144.5,255.8,144.5z"></path>
                                                    </g>
                                                </svg>
                                            </span>`
                            };

                this.alertType = {
                    'primary': `sc_primary`,
                    'secondary': `sc_secondary`,
                    'success': `sc_success`,
                    'warning': `sc_warning`,
                    'danger': `sc_danger`,
                    'default': ``
                };

                this.generateStructur();
            }

            generateStructur()
            {
                /* confirmation main wraper */
                this.sc_confirmation_wraper = _dom.createElement([{
                                                    tag: 'div',
                                                    attr: {
                                                        class: 'sc_confirmation_wraper'
                                                    }
                                                }]);


                /* confirmation content box */
                this.sc_content_box = _dom.createElement([{
                                                        tag: 'div',
                                                        attr: {
                                                            class: `sc_confirmation ${ this.alertType[this.status] }`
                                                        },

                                                        children:[
                                                            /* icon element */
                                                            this.icons[this.status]
                                                        ]
                                                    }]);


                /* confirmation content body */
                this.sc_content_body = _dom.createElement([{
                                                            tag: 'div',
                                                            attr: {
                                                                class: 'sc_body'
                                                            },

                                                            children: [
                                                                /* body title element */
                                                                {
                                                                    tag: 'h4',
                                                                    attr: {
                                                                        class: 'sc_title'
                                                                    },
                                                                    children: this.title
                                                                },
                                                                /* body msg element */
                                                                {
                                                                    tag: 'p',
                                                                    attr: {
                                                                        class: 'sc_msg'
                                                                    },
                                                                    children: this.msg
                                                                }
                                                            ]
                                                        }
                                                    ]);

                /* input field for prompt */
                if(this.type==='prompt')
                {
                    this.promptInput = _dom.createElement([{
                                                            tag: 'input',
                                                            attr: {
                                                                class: 'sc_input',
                                                                type: 'text',
                                                                value: this.defaultValue,
                                                                placeholder: 'write here'
                                                            }
                                                        }]);

                    _dom.append(this.sc_content_body, this.promptInput);
                }




                /* confirmation content footer */
                this.sc_content_footer = _dom.createElement([{
                                                            tag: 'div',
                                                            attr: {
                                                                class: (this.type==='alert') ? `sc_footer _flex_end` : `sc_footer`
                                                            },
                                                            children: [
                                                                /* footer no button */
                                                                (this.type!=='alert') && {
                                                                    tag: 'button',
                                                                    attr: {
                                                                        class: `sc_close`
                                                                    },
                                                                    children: 'No',
                                                                    event: {
                                                                        'click': ()=>{this.noBtnEvent(this);}
                                                                    }
                                                                },

                                                                /* footer yeas button */
                                                                {
                                                                    tag: 'button',
                                                                    attr: {
                                                                        class: `sc_confirm`
                                                                    },
                                                                    children: 'Ok',
                                                                    event: {
                                                                        'click': ()=>{this.yeasBtnEvent(this);}
                                                                    }
                                                                }
                                                            ]

                                                        }
                                                    ]);

                
                /* addContentBox child to it */
                _dom.append(this.sc_content_box, this.sc_content_body);
                _dom.append(this.sc_content_box, this.sc_content_footer);
            }

            render()
            {
                _dom.append(this.sc_confirmation_wraper, this.sc_content_box);
                _dom.append(document.body, this.sc_confirmation_wraper);
            }

            noBtnEvent()
            {
                if(this.callBack !== false) this.callBack(false);
                this.modalClose();
            }
            yeasBtnEvent()
            {
                if(this.callBack !== false){
                    if(this.type==='prompt')
                        this.callBack(this.promptInput.value);
                    else
                        this.callBack(true);
                }

                this.modalClose();
            }

            modalClose()
            {
                this.sc_content_box.classList.add('sc_close_animation');
                this.sc_content_box.addEventListener('animationend', (e)=>{
                    if(e.animationName==='sc_confirm_modal_close')
                    {
                        this.sc_confirmation_wraper.classList.add("remove");
                        this.sc_confirmation_wraper.addEventListener('transitionend', (e)=>{
                            if(e.propertyName==='opacity'){
                                _dom.removeElement(this.sc_confirmation_wraper);
                            }
                        });
                    }
                })
            }
        }


        /**
         * now make alert using 'SCALERTMSG' class
         */
        const defaultTitle = `${location.host} Sayed!`;
        function _alert(userInputAsObj={})
        {
            let {title=defaultTitle,  msg='Alert message!', design='default', callback=false, event=false} = userInputAsObj;
            
            /* if clicked element is an achor tag then process this satart ---------------*/
                let sc_currentTarget=false;
                if(event){
                    sc_currentTarget = event.target;
                    if(sc_currentTarget && sc_currentTarget.nodeName==='A') event.preventDefault();
                    
                    if(callback===false && sc_currentTarget && sc_currentTarget.nodeName==='A')
                    {
                        callback = (status)=>{
                            if(status) location.href = sc_currentTarget.href;
                        }
                    }
                }

            /* if clicked element is an achor tag then process this end -----------------*/

            let alert = new SCALERTMSG({title, msg, status: design, type:'alert'}, callback);
            alert.render();
        }


        function _confirm(userInputAsObj={})
        {
            let {title=defaultTitle, msg='Confirmation message!', design='default', callback=false, event=false} = userInputAsObj;

            /* if clicked element is an achor tag then process this satart ---------------*/
                let sc_currentTarget=false;
                if(event){
                    sc_currentTarget = event.target;
                    if(sc_currentTarget && sc_currentTarget.nodeName==='A') event.preventDefault();
                }

                if(callback===false && sc_currentTarget && sc_currentTarget.nodeName==='A')
                {
                    callback = (status)=>{
                        if(status) location.href = sc_currentTarget.href;
                    }
                }
            /* if clicked element is an achor tag then process this end -----------------*/

            let confirm = new SCALERTMSG({title, msg, status: design, type:'confirm'}, callback);
            confirm.render();
        }


        function _prompt(userInputAsObj={})
        {
            let {title=defaultTitle, msg='Prompt message!', defaultValue='', design='default', callback=false, event=false} = userInputAsObj;

            /* if clicked element is an achor tag then process this satart ---------------*/
                let sc_currentTarget=false;
                if(event){
                    sc_currentTarget = event.target;
                    if(sc_currentTarget && sc_currentTarget.nodeName==='A') event.preventDefault();
                }

                if(callback===false && sc_currentTarget && sc_currentTarget.nodeName==='A')
                {
                    callback = (respons)=>{
                        if(respons) location.href = sc_currentTarget.href+'/'+respons;
                    }
                }
            /* if clicked element is an achor tag then process this end -----------------*/
            

            let prompt = new SCALERTMSG({title, msg, defaultValue, status: design, type:'prompt'}, callback);
            prompt.render();
        }
    }
/* alert, confirm box and prompt script end */