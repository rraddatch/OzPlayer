/*******************************************************************************
 Copyright (c) 2013-20 AccessibilityOz       http://www.accessibilityoz.com.au/
 ------------------------------------------------------------------------------
 OzPlayer [4.1] => player core
 ------------------------------------------------------------------------------
*******************************************************************************/
var OzPlayer = (function()
{

    /*** IMPORTANT NOTE ********************************************************

    this script makes use of pre-processing statements, eg:

        //### PHP ###// <?php if(isset($_GET['foo'])): ?>

        ... javascript code ...

        //### PHP ###// <?php endif; ?>

    when the script is parsed by the compressor, those statements are evaluated,
    so that different versions of the output can be defined via input parameters
    (eg. in that example, using query values to determine different code forks)
    while the leading comment marker ensures that the code is still valid JS
    though obviously running the code as JS won't parse any of the conditions
    so we need to consider how the code will be interpreted when it's pure JS
    eg. if we have two different version of a function declaration, then the
    second one will take precedence, so it must be treated as the default

    ***************************************************************************/



    //-- private => local document shortcuts --//
    var _ = document, __ = window;



    //-- private => general utilities --//
    //nb. originally this was defined after the initial supported check
    //but it's moved here to help obfuscate that, so that the call to it is
    //much further down the script, instead of being right at the top
    //this does mean that all unsupporting browsers will have to parse it
    //but all such browsers added together is still a tiny proportion
    var etc =
    {

        //test whether a value is defined, ie:
        //=> def(foo)    foo IS defined
        //=> !def(foo)    foo is NOT defined
        //with an optional secondary control test, that's either strict
        //equality or inequality depending on the optional test flag,
        //defaulting to inequality unless the flag is strictly true, ie:
        //=> def(foo, bar[, false])        foo IS defined AND is NOT equal to bar
        //=> !def(foo, bar[, false])    foo is NOT defined OR IS equal to bar
        //=> def(foo, bar, true)        foo IS defined AND IS equal to bar
        //=> !def(foo, bar, true)        foo is NOT defined OR is NOT equal to bar
        def : function(a, b, c)
        {
            if(typeof(a) === 'undefined' || typeof(a) === 'unknown')
            {
                return false;
            }
            if(typeof(b) === 'undefined')
            {
                return true;
            }
            if(c === true)
            {
                return a === b;
            }
            return a !== b;
        }

        //shortcut abstraction for iterating:
        //=> through the enumerable members of an object
        //=> through the members of an array or nodelist
        //=> from zero to (int(data) - 1) [if data is a number]
        //=> through the array returned by get(data) [if data is a string]
        //calling oninstance in the etc scope for each iteration, breaking if the
        //callback returns false, or effectively continueing if it returns true
        //btw. numeric counters are passed the value and original integer;
        //array and nodelist counters are passed the value, index and length;
        //object counters are passed the value, key and a running count;
        , each : function(d, f)
        {
            if(!this.def(d, null))
            {
                return;
            }
            else if(typeof(d) == 'string')
            {
                this.each(this.get(d), f);
            }
            else if(typeof(d) == 'number')
            {
                for(var n = parseInt(d, 10), i = 0; i < n; i ++)
                {
                    if(f.call(this, i, n) === false)
                    {
                        break;
                    }
                }
            }
            else if(this.def(d.length))
            {
                for(var r, len = d.length, i = 0; i < len; i ++)
                {
                    if((r = f.call(this, d[i], i, len)) === false)
                    {
                        break;
                    }
                    else if(typeof(r) == 'number')
                    {
                        i += parseInt(r, 10);
                        len = d.length;
                    }
                }
            }
            else
            {
                var n = 0;
                for(var i in d)
                {
                    if(d.hasOwnProperty(i))
                    {
                        if(f.call(this, d[i], i, ++n) === false)
                        {
                            break;
                        }
                    }
                }
            }
        }

        //test an array or object for the presence of a value
        //returning the index of an array match or -1 for none
        //or returning the key of an object match or null for none
        //nb. use native array indexOf if applicable and supported
        //nb. if the subject contains more than one instance of the value
        //then the first one to be found will be returned, which will be
        //the earliest member of an array, or usually the first-defined
        //member of an object, although that can't be totally guaranteed
        //because the order of iteration through an object is not proscribed
        //but in practise all browsers except konqueror iterate in the order
        //the properties were defined, while konqueror is the reverse of that
        , find : function(s, v)
        {
            if(s.indexOf)
            {
                return s.indexOf(v);
            }
            var f = (s instanceof Array) ? -1 : null;
            this.each(s, function(d, k)
            {
                if(v === d)
                {
                    f = k;
                    return false;
                }
            });
            return f;
        }

        //return whether a variable is empty, which will always match:
        //=> undefined, null, empty-string, array with no members, object with no
        //   enumerable members (including most built-in constructors and new instances)
        //and will optionally match => whitespace-only string if space is true(ish)
        //but explicitly won't match => boolean, number, function (whatever its value)
        , empty : function(d, w)
        {
            if(typeof(d) == 'boolean' || typeof(d) == 'number' || typeof(d) == 'function')
            {
                return false;
            }
            if(typeof(d) == 'string')
            {
                return !(w ? this.trim(d) : d);
            }
            var m = true;
            this.each(d, function()
            {
                return m = false;
            });
            return m;
        }

        //recursively copy all the properties of an object or array
        //into a new one, to create a copy of the data rather than a reference
        //nb. if input is null or not an object we just return it unchanged
        //behaviour which the inner recursion statement also relies on
        , copy : function(d)
        {
            if(typeof(d) != 'object' || d === null)
            {
                return d;
            }
            var x = (d instanceof Array) ? [] : {};
            this.each(d, function(v, k)
            {
                x[k] = this.copy(v);
            });
            return x;
        }


        //get an element or array of elements, optionally
        //within a given context like a subtree or external document,
        //matching elements by one of the following patterns:
        //=> a single element by ID
        //=> an array of element(s) by tag-name
        //=> an array of element(s) returned by selector query, if supported
        //btw. if context is a string it will be converted to get(context)
        //assuming that its value is a single element ID-selector match
        //but if that then returns null the function also returns null
        , get : function(s, x)
        {
            if(!this.def(x, null))
            {
                x = document;
            }
            else if(typeof(x) == 'string')
            {
                if((x = this.get(x)) === null)
                {
                    return null;
                }
            }
            if((s = this.trim(s)).indexOf('#') === 0)
            {
                return x.getElementById(s.substr(1));
            }
            if(/^(\*|[a-z1-6]+)$/i.test(s))
            {
                var r = [];
                this.each(x.getElementsByTagName(s), function(m)
                {
                    if(m.nodeType === 1 && m.nodeName.indexOf('/') < 0)
                    {
                        r.push(m);
                    }
                });
                return r;
            }
            try
            {
                return this.list(x.querySelectorAll(s));
            }
            catch(ex) { return []; }
        }

        //convert a DOM nodelist to a static array
        , list : function(l)
        {
            var a = [];
            this.each(l, function(m)
            {
                a.push(m);
            });
            return a;
        }


        //trim leading and trailing whitespace from a string
        //or for safety, if it's not a string just return it straight back
        //so we can pass unknown values that are only trimmed if they are
        , trim : function(s)
        {
            if(typeof(s) != 'string')
            {
                return s;
            }
            return s.replace(/^\s+|\s+$/g, '');
        }

        //convert line-breaks to spaces, minimize contiguous tabs and spaces
        //to a single space, and trim all leading and trailing whitespace
        //or for safety, if it's not a string just return it straight back
        //so we can pass unknown values that are only flattened if they are
        , flatten : function(str)
        {
            if(typeof(str) != 'string')
            {
                return str;
            }
            return this.trim(str.replace(/[\r\n]*\s*[\r\n]+/g, ' ').replace(/[\ \t]+/g, ' '));
        }

        //de-tokenise a language string
        , sprintf : function(s, a)
        {
            this.each(a, function(b, t)
            {
                while(s.indexOf('%' + t) >= 0)
                {
                    s = s.replace('%' + t, b);
                }
            });
            return s;
        }


        //create an element, optionally with any of the data supported
        //by the render function, plus any of the following meta-data:
        //=> a DOM insertion reference
        //btw. if the tag is already an element reference, it will be
        //referenced instead of creating an element, which means we can
        //use this function as a shortcut for appending or moving nodes
        , build : function(t, d)
        {
            if(t.nodeType === 1)    { var m = t; }
            else                    { m = _.createElement(this.trim(t).toLowerCase()); }
            if(!this.def(d, null))  { return m; }

            m = this.render(m, d);
            this.each(d, function(v, k)
            {
                if(k == '=parent')          { m = v.appendChild(m); }
                else if(k == "=replace")    { v.parentNode.replaceChild(m, v); }
                else if(k == "=before")     { m = v.parentNode.insertBefore(m, v); }
                else if(k == "=after")      { m = this.appendSibling(m, v); }
                if(k.charAt(0) == '=')      { return false; }
            });
            return m;
        }

        //add data to an element, which can be any of the following:
        //=> inner text-nodes
        //=> inner HTML
        //=> class names
        //=> other attributes
        //=> style properties
        //=> other dot properties
        //=> child nodes and subtrees
        //=> encapsulated event listeners
        //btw. if element is undefined or null we return null for safety
        //btw. attribute values can be empty but they can't be null
        //btw. if you pass an existing element and set its "class"
        //then the class will be replaced unless you specify "+class"
        //btw. you can assign the same value to multiple properties
        //by specifying a comma-delimited key, eg. "id, name, #text"
        , render : function(m, d)
        {
            if(!this.def(m, null)) { return null; }
            if(!this.def(d, null)) { return m; }
            this.each(d, function(v, k)
            {
                if(k.indexOf(',') >= 0)
                {
                    this.each(this.trim(k).split(/\s*,\s*/g), function(j)
                    {
                        d[j] = v;
                    });
                    d[k] = null;
                }
            });
            this.each(d, function(v, k)
            {
                if(k.charAt(0) == '=')  { return true; }
                if(k == '#text')        { m.appendChild(_.createTextNode(v)); }
                else if(k == '#html')   { this.appendHTML(m, v); }
                else if(k == '#dom')
                {
                    this.each((v instanceof Array) ? v : [v], function(x)
                    {
                        m.appendChild(x);
                    });
                }
                else if(k == '#style')
                {
                    this.each(v, function(c, p)
                    {
                        m.style[p] = c;
                    });
                }
                else if(k.charAt(0) == '.') { m[k.substr(1)] = v; }
                else if(k.substr(0,2) == 'on')
                {
                    this.listen(m, k.substr(2), v);
                }
                else if(v !== null)
                {
                    var r = (k == '+class'), k = k.replace('+', '');
                    if(k == 'class')    { this.addClass(m, v, !r); }
                    else                { m.setAttribute(k, v); }
                }
            });
            return m;
        }

        //append a node to the DOM as a target's next-sibling, and return it
        , appendSibling : function(m, t)
        {
            if(t == t.parentNode.lastChild)
            {
                return t.parentNode.appendChild(m);
            }
            return t.parentNode.insertBefore(m, t.nextSibling);
        }

        //add an HTML string to a target element via an intermediate container
        //nb. this avoids the browser issues from adding innerHTML directly
        //producing a clean and unmolested subtree inside the target
        , appendHTML : function(m, h, w)
        {
            if(this.def(w, false))
            {
                m.innerHTML = '';
            }

            var x = _.createElement('div');
            x.innerHTML = h;

            while(x.hasChildNodes())
            {
                m.appendChild(x.childNodes[0]);
            }
            return m;
        }

        //remove an element by reference to its parent,
        //then return null for the caller's convenience
        , remove : function(m)
        {
            m.parentNode.removeChild(m);
            return null;
        }


        //add an encapsulated event-listener and control its native action
        //with a handler that's called in the element's scope so you can refer to
        //it as "this", which is passed references to the event and event-target,
        //and returns an object with a silence method that can remove the event
        //from its context, plus a restore method that can re-apply it again,
        //which is also passed as the third argument to the handler function
        //btw. we return null for safety if the context is undefined or null
        //or if context is a string it will be converted to get(context)
        //assuming that its value is a single element ID-selector match
        //but if that then returns null then this function also returns null
        //btw. how the callback returns determines how the native action is controlled
        , listen : function(x, t, h, c)
        {
            if(!this.def(x, null))
            {
                return null;
            }
            else if(typeof(x) == 'string')
            {
                if((x = this.get(x)) === null)
                {
                    return null;
                }
            }
            var etc = this;
            if(this.def(x.addEventListener))
            {
                var s =
                {
                    silence : function()
                    {
                        x.removeEventListener(t, h.__w, h.__c);
                    },
                    restore : function()
                    {
                        x.addEventListener(t, h.__w, h.__c);
                    }
                };
                x.addEventListener(t, h.__w = function(e)
                {
                    //nb. when the youtube flash player dispatches volumechange events in IE11
                    //they don't always have an event argument, and that makes the volume slider fail
                    //(ie. it moves but it can't update the volume more than once per session)
                    //so to avoid that problem, check for e and exit if it's undefined
                    //then the errors won't occur and the volume slider will work correctly again
                    if(!e) { return; }

                    if(etc.def(h.__r = h.call(x, e, etc.target(e), s)))
                    {
                        if(h.__r !== true)
                        {
                            if(h.__r === null)
                            {
                                try { e.stopPropagation(); } catch(ex){}
                                e.cancelBubble = true;
                            }
                            try { e.preventDefault(); } catch(ex){}
                            h.__r = false;
                        }
                        return h.__r;
                    }
                }, h.__c = c || false);
                return s;
            }
            else if(this.def(x.attachEvent))
            {
                var s =
                {
                    silence : function()
                    {
                        x.detachEvent('on' + t, h.__w);
                    },
                    restore : function()
                    {
                        x.attachEvent('on' + t, h.__w);
                    }
                };
                x.attachEvent('on' + t, h.__w = function(e)
                {
                    if(etc.def(h.__r = h.call(x, e, etc.target(e), s)))
                    {
                        if(h.__r !== true)
                        {
                            if(h.__r === null)
                            {
                                e.cancelBubble = true;
                            }
                            h.__r = false;
                        }
                        return h.__r;
                    }
                });
                return s;
            }
        }

        //get the target of an event, converted to parent if it's a text node
        , target : function(e)
        {
            var m = e.target || e.srcElement || window;
            while(m.nodeType == 3)
            {
                return m.parentNode;
            }
            return m;
        }

        //contains method evaluates whether one node contains the other
        //as in "does primary node contain event target"
        , contains : function(a, b)
        {
            if(b === a)     { return true; }
            if(b === null)  { return false; }
            else            { return this.contains(a, b.parentNode); }
        }

        //identify the current button from a mouse event object
        //and return the number used in the "which" model (1=left, 2=middle, 3=right)
        , button : function(e)
        {
            if(this.def(e.which))
            {
                return e.which;
            }
            switch(e.button)
            {
                case 0    : return 1;
                case 1    : return 1;
                case 4    : return 2;
                case 2    : return 3;
            }
        }


        //get the position of an element with respect to the "viewport"
        //ie. the portion of the canvas element (<html> or <body> according to quirksmode)
        //which is inside the scrollable portion of the browser window
        , getViewportPosition : function(m)
        {
            //get the bounding client-rect position of the node
            //and return it in an object of x,y properties
            //nb. we've already confirmed that the browser
            //supports this when we defined $this.supported
            var r = m.getBoundingClientRect();
            return {
                x : r.left,
                y : r.top
                };
        }

        //constrain the absolute position of an element to the bounds of another
        , constrain : function(m, x)
        {
            //define the context position with respect to the viewport
            //and get its dimensions using the offset properties,
            //which include any box-layout properties like padding or border
            var a =
            {
                p         : this.getViewportPosition(x),
                s         :
                {
                    x     : x.offsetWidth,
                    y     : x.offsetHeight
                }
            };

            //then define need a similar object of properties for the target element
            var b =
            {
                p         : this.getViewportPosition(m),
                s         :
                {
                    x     : m.offsetWidth,
                    y     : m.offsetHeight
                }
            };

            //now we have that data we can constrain each of the target positions
            //nb. we don't physically re-position the element here, because
            //the positions we have don't reflect its positioning context,
            //eg. 100,100 might actually be applied as eg. left:0; top:20px;
            //because it's absolutely positioned inside another positioned container
            //so instead we return adjustments that specify the amount by which
            //the target's position needs to be changed in order to constrain it
            //then the caller can appy those adjustments according to the context
            //so, first define the adjustments object with initially zero values
            //plus a temporary diff var we can use for assignment in conditions
            var n, j = { x : 0, y : 0 };

            //then calculate the necessary adjustments to constrain
            //the target's x and y edge to each of the context edges
            this.each(a.p, function(q, z)
            {
                //constrain to the left and top edges
                if((n = q - b.p[z]) > 0)
                {
                    j[z] += n;
                }

                //constrain to the right and bottom edges
                if((n = (b.p[z] + b.s[z]) - (q + a.s[z])) > 0)
                {
                    j[z] -= n;
                }
            });

            //return the final adjustments object
            return j;
        }


        //get the applied value of an element css property
        //using getComputedStyle or currentStyle as supported
        //nb. all supported browsers supported one or the other
        , getStyle : function(element, prop)
        {
            if(this.def(window.getComputedStyle))
            {
                return window.getComputedStyle(element, null)[prop];
            }
            return element.currentStyle[prop];
        }


        //test an element for a class or class-match, excluding substrings
        //ie. hasClass(element, "bar") will not match "barmy" or "ackbar", but it
        //will match "foo bar" or "bar foo" when the element has multiple classes
        //btw. the value only accepts a string, but it's evaluated as a regex
        //so you can match interpretive values like "foo|bar" (foo OR bar)
        //you can also match space-separated multiples like "foo bar" (foo AND bar)
        //btw. if the element is not an element, or has no class, we return false for safety
        //so you can pass references that might be undefined, null, or other nodes
        , hasClass : function(m, v)
        {
            if(!m || !m.className)
            {
                return false;
            }

            v = this.trim(v).split(' ');

            for(var len = v.length, i = 0; i < len; i++)
            {
                //nb. escape the spaces in the regex to avoid symbol whitespace compression
                if(!new RegExp('(\ |^)(' + v[i] + ')(\ |$)').test(m.className))
                {
                    return false;
                }
            }
            return true;
        }

        //add a class name, maintaining neat spacing,
        //then return the input element reference for convenience
        //btw. if the overwrite flag is defined and true then any
        //existing element class will be deleted before these additions
        //btw. you can add multiple classes by separating them with a space
        //and each addition is qualfied by hasClass to avoid duplication
        , addClass : function(m, v, w)
        {
            if(!m.className || this.def(w, false))
            {
                m.className = '';
            }
            //nb. escape the spaces in the regex to avoid symbol whitespace compression
            this.each(this.trim(v).split(/[\ \t]+/), function(s)
            {
                if(!this.hasClass(m, (s = this.trim(s))))
                {
                    m.className = this.flatten(m.className + ' ' + s);
                }
            });
            return m;
        }

        //remove a class name, maintaining neat spacing
        //then return the input element reference for convenience
        //btw. you can remove multiple classes by separating them with a space
        //so that each is removed irresepective of whether the others are defined
        //btw. you can also pass simple regular expressions like "one|two"
        //which will remove either or both classes as defined (using greedy)
        //btw. if value is undefined or null the class will be cleared completely
        , removeClass : function(m, v)
        {
            if(m.className)
            {
                if(!this.def(v, null))
                {
                    m.className = '';
                }
                else
                {
                    //nb. escape the spaces in this expression to avoid symbol whitespace compression
                    this.each(this.trim(v).split(/[\ \t]+/), function(s)
                    {
                        m.className =
                            this.flatten(m.className.replace(
                                //nb. escape the spaces in this expression to avoid symbol whitespace compression
                                new RegExp('((\ )' + this.trim(s) + ')|((^)' + this.trim(s) + '(\ |$))', 'g'),
                                ''
                                ));
                    });
                }
            }
            return m;
        }

        //exchange one class name for another, maintaining neat spacing
        //then return the input element reference for convenience
        //btw. the value can accept a string or a regex, including backreferences;
        //so swap with an empty string would equate to remove with a regex
        //btw. the swap will only happen if the element has the oldvalue class
        //(it won't just do an addClass if the oldvalue isn't there)
        , swapClass : function(m, a, b)
        {
            m.className = this.flatten(m.className.replace(a, b));
            return m;
        }


        //implement a timed callback and return the timer reference
        //btw. if the callback is the first argument the delay defaults to 10ms
        //else the first argument is the delay and the second is the callback
        , delay : function(a, b)
        {
            var
            z = this,
            n = typeof(a) === 'number' ? a : 10,
            f = b || a;

            return __.setTimeout(function(){ f.call(z, n); }, n);
        }


        //qualify a string href to form a complete URL
        //using the current document location to evaluate relative paths
        //nb. this could be neated and simplified, but I'm reluctant to
        //scruffy though this code is, it's very well tested and proven
        , qualify : function(f)
        {
            var
            d = document,
            h = d.location.href,
            p = h.replace('/'+'/', '/').split('/'),
            l = { protocol : p[0], host : p[1] };
            p.splice(0, 2);
            l.pathname = '/' + p.join('/');
            var uri = l.protocol + '/'+'/' + l.host;
            if(/^(\.\/)([^\/]?)/.test(f))
            {
                f = f.replace(/^(\.\/)([^\/]?)/, '$2');
            }
            if(/(^([a-z]+)\:\/\/)/.test(f))
            {
                uri = f;
            }
            else if(f.substr(0, 1) == '/')
            {
                uri += f;
            }
            else if(/^((\.\.\/)+)([^\/].*$)/.test(f))
            {
                var n = f.match(/^((\.\.\/)+)([^\/].*$)/);
                n = n[n.length - 1];
                var r = f.split('../').length - 1;
                var p = l.pathname.split('/');
                p = p.splice(0, p.length - 1);
                for(var i=0; i<r; i++)
                {
                    p = p.splice(0, p.length - 1);
                }
                var t = '';
                for(i=0; i<p.length; i++)
                {
                    if(p[i] != '')
                    {
                        t += '/' + p[i];
                    }
                }
                t += '/';
                t += n;
                uri += t;
            }
            else
            {
                t = '';
                p = l.pathname.split('/');
                p = p.splice(0, p.length - 1);
                for(var i=0; i<p.length; i++)
                {
                    if(p[i] != '')
                    {
                        t += '/' + p[i];
                    }
                }
                t += '/';
                uri += t + f;
            }
            return uri;
        }


        //create and return a new ajax request object
        //or null if ajax is unsupported or fails to instantiate
        , ajax : function()
        {
            var x = null;

            if(this.def(__.ActiveXObject))
            {
                try         { x = new ActiveXObject('Microsoft.XMLHTTP'); }
                catch(ex)     { x = null; }
            }
            if(x === null && this.def(__.XMLHttpRequest))
            {
                try         { x = new XMLHttpRequest(); }
                catch(ex)     { x = null; }
            }
            return x;
        }

        //load text data from the network and fire a callback
        //with the response, or with null if loading fails,
        //along with a local or server produced status code:
        //=> if a request can't be instantiated we return 501 (not implemented)
        //=> if ajax throws a network or security error we return 502 (bad gateway)
        //=> if ajax throws an error reading the response we return 406 (not acceptable)
        //=> if the request is successful it returns 200 / 304 (ok / not modified)
        //=> if the request fails it returns the failure code, eg. 404 (not found)
        //btw. if the nocache flag is strictly true then the request
        //will include a timestamp so we don't get a cached response
        , load : function(u, c, f)
        {
            var
            z = this,
            x = this.ajax();
            if(x === null)
            {
                return f(null, 501);
            }
            if(c === true)
            {
                u += (u.indexOf('?') < 0 ? '?' : '&') + 'timestamp=' + new Date().getTime();
            }
            x.open('GET', u, true);
            x.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            x.onreadystatechange = function()
            {
                if(x.readyState == 4)
                {
                    //*** DEV TMP LATENCY
                    //__.setTimeout(function(){
                    //_.ondblclick=function(){

                    try
                    {
                        return f
                        (
                            (/^(0|200|304)$/.test(x.status.toString()) ? z.trim(x.responseText || '') : null),
                            x.status,
                            x.getResponseHeader('Content-Type')
                        );
                    }
                    catch(ex)
                    {
                        return f(null, 406);
                    }

                    //*** DEV TMP LATENCY
                    //},(Math.random()*9000));
                    //},(6000));
                    //},(3000));
                    //},(1000));
                    //};
                }
            };
            try
            {
                x.send(null);
            }
            catch(ex)
            {
                return f(null, 502);
            }
        }


        //### PHP ###// <?php if(isset($_GET['fork']) && $_GET['fork'] == 'subs'): ?>

        //create and return a new cors object
        //or null if cors is unsupported or fails to instantiate
        //using XDomainRequest for IE8-10 and XMLHttpRequest2 for everyone else
        , cors : function()
        {
            var x = null;

            if(this.def(window.XDomainRequest))
            {
                try       { x = new XDomainRequest(); }
                catch(ex) { x = null; }
            }
            else if(this.def(window.XMLHttpRequest))
            {
                try
                {
                    x = new XMLHttpRequest();

                    if(!this.def(x.withCredentials))
                    {
                        x = null;
                    }
                }
                catch(ex) { x = null; }
            }
            return x;
        }

        //get plain text from a remote server, or post data to it
        //and fire a callback with the response, or with null if loading fails
        //along with locally produced status information:
        //=> if the request can't instantiate we return 501 (not implemented)
        //=> if the request fails for any reason we return 409 (conflict)
        //=> if the request is successul we return 200 (ok)
        //btw. if the nocache flag is strictly true then the request
        //will include a timestamp so we don't get a cached response
        //btw. the server must respond with Access-Control-Allow-Origin
        //which specifies either the origin URL or "*" to allow any URL
        //otherwise the request will fail with an authentication error
        //btw. if the request is POST then the server must also respond with
        //Access-Control-Allow-Headers: Content-Type, because Safari will make a
        //pre-flight request which must explcitly allow the POST to have content-type
        //(even though it's not specified, and isn't showing in the request headers!)
        //and we still can't specify a content-type, because XDomainRequest won't allow it
        , xrequest : function(u, d, c, f)
        {
            var
            z = this,
            x = this.cors();

            //*** DEV TMP LATENCY
            //__.setTimeout(function(){
            //_.ondblclick=function(){

            if(x === null)
            {
                return f(null, 501, 'Not Implemented');
            }
            if(c === true)
            {
                u += (u.indexOf('?') < 0 ? '?' : '&') + 'timestamp=' + new Date().getTime();
            }
            x.open(d !== null ? 'POST' : 'GET', u, true);
            x.onload = function()
            {
                return f(z.trim(x.responseText), 200, 'OK');
            };
            x.onerror = function()
            {
                return f(null, 409, 'Conflict');
            };
            x.send(d);

            //*** DEV TMP LATENCY
            //},(Math.random()*6000));
            //},(10000));
            //};
        }

        //### PHP ###// <?php endif; ?>


        //show a prefixed console message if the console is available,
        //defaulting to an info message if the type is undefined, then if
        //alert-on-error is enabled and this is an error, also show an alert
        //but do so after a shortish delay so that most of the rest of the page
        //can finish rendering before the dialog's modality interrupts it
        //(which isn't essential, but without that delay you'll usually see the
        // original native controls before they've had a chance to be replaced)
        //finally return false for convenience so callers can use it to return failure
        , console : function(m, t)
        {
            m = config.lang['console-prefix-' + (t = t || 'info')] + m;

            if(this.def(__.console))
            {
                console[t](m);
            }
            if(config['alert-on-error'] === true && t === 'error')
            {
                etc.delay(250, function(){ alert(m); });
            }

            return false;
        }
    },



    //-- private => definition pseudo-constants dictionary --//
    //nb. originally this was defined after the config dictionary
    //but it was moved here so we could use it to filter out some
    //older browsers as part of the initial $this.supported exception
    defs =
    {

        //user-agent dictionary, which defines the explicit platform and browser
        //flags we need, for cases where feature detection is not applicable
        //(see http://www.sitepoint.com/javascript-feature-detection-fails/)
        //nb. create all values as strict booleans for flexibility and safety
        //nb. opera next and chromium edge are identified as google chrome
        //they don't need to be treated separately since they use the same engines
        'agent' : (function()
        {
            var n = navigator, p = n.platform, a = n.userAgent, u =
            {
                ios         : /^ip(ad|hone)/i.test(p),
                iphone      : p == 'iPhone',
                android     : /^(android|linux arm)/i.test(p) || (/android/i.test(a) && !/edge/i.test(a)),
                windows     : p == 'Win32',
                firefox     : !!__.InstallTrigger,
                chrome      : n.vendor == 'Google Inc.' || n.vendor == 'Opera Software ASA',
                webkit      : /webkit/i.test(a),
                safari      : n.vendor == 'Apple Computer,\ Inc.',
                ie          : !!_.uniqueID
            };

            u.ie11p         = !!(u.ie && __.Intl);

            if(u.edge       = !u.ie && !!window.StyleMedia) { u.webkit = false; }

            u.iphone10p     = u.iphone && /version\/[\d]{2}\./i.test(a);

            u.opera12m      = !!__.opera;
            u.firefox15m    = !!(u.firefox && !Number.isFinite);
            u.firefox9m     = !!(u.firefox15m && !_.documentElement.mozRequestFullScreen);

            //*** DEV TMP
            //console.log('platform = "'+p+'"\nvendor = "'+n.vendor+'"\nua = "'+a+'"');
            //alert('platform = "'+p+'"\nvendor = "'+n.vendor+'"\nua = "'+a+'"');
            //var str = '';etc.each(u, function(v,k){ str += k+' = '+(v===true?'TRUE':v)+'\n'; });
            //console.log(str);
            //alert(str);

            return u;

        }).apply($this),

        //registered events supported by the addListener function
        //see the addListener code for notes about this
        'events' : ['play', 'pause', 'ended']

    },







    //-- private => universal self reference --//
    //nb. $$ sets an initial support flag on, and returns, the input reference
    //which is always true in the paid version, but may be false in the free version
    //because there it's defined by host validation of the src of this script
    //using the $$ name so that it appears to be some kind of namespace resolution
    //like you sometimes see in cases where two libraries both use a global $ function
    //and that's delibarate, as a way of obfuscating the purpose of the function
    //just one of several ways in which the validation code is obscured
    //so that it's harder to find by searching through the codebase
    //which should make it harder to circumvent for those who are not JS proficient
    //(although those who are would still be able to figure out what's what)
    $this = $$(this);



    //-- public => supported flag --//

    //then redefine the support flag based on feature detection
    //and exit if the support flag is already false from validation
    //or if the browser doesn't have the necessary feature support
    //but return some public data so this flag remains available either way
    //and so that subsequent calls to public methods don't cause errors
    //nb. even though this is a public property, authors can't just set it true
    //to bypass validation, because usable constructors never get defined
    //they'd have to hack the code of this script itself to bypass validation
    if(!($this.supported =
    (
        //*** DEV TMP
        //false &&

        //this checks the existing validation flag
        $this.supported
        &&
        //this excludes specific browsers that we can't support anymore:
        //=> IE6-8 will only see the static fallback content
        //=> IE9-10 and Winphone will see native video with supported codecs
        //=> Opera 12 and Firefox 3-8 will also see native/supported video
        //nb. in cases where native video is supported but not that codec
        //(eg. if the only source is WebM when the browser only supports MP4)
        //those browsers will get a broken native player, where ideally we'd
        //give them the fallback content, but that doesn't happen automatically
        //and it would be semi-complex to handle, and it's not really worth it
        !(
            (defs.agent.ie && !defs.agent.ie11p)
            ||
            defs.agent.opera12m
            ||
            defs.agent.firefox9m
        )
        &&
        //this excludes remaining browsers which don't have getBoundingClientRect
        //(eg. Safari <= 3 or equivalent webkit, and Firefox <= 2 or equivalent gecko)
        //nb. we will need this for calculating eg. constrained tooltips positions
        //but it also rids us of the hassle of too many legacy quirks and workarounds
        //nb. using documentElement for this test so the script can be placed anywhere
        etc.def(_.documentElement.getBoundingClientRect)
    )))
    {
        //*** DEV TMP VALIDATION
        //_.title += '[OFF]';

        //return public shells so that calling them doesn't cause errors
        $this.define = function(){};
        $this.Video = function(){};
        $this.Audio = function(){};
        $this.init = function(){};
        return $this;
    }







    //-- privileged => config and language dictionaries --//
    var config =
    {

        //show an alert for console errors, in addition to console messages
        //or as the only error output if the console is unsupported
        //nb. this doesn't apply to info or warning messages
        'alert-on-error'          : false,

        //load captions files using a query timestamp to prevent caching
        'captions-nocache'        : false,


        //### PHP ###// <?php if(isset($_GET['fork']) && $_GET['fork'] == 'free'): ?>

        //ozplayer logo-bug href, or set empty-string to remove the logo
        //nb. this is encoded as zero-padded character codes for obfuscation,
        //so that it's harder to find and remove it by just searching for the URL
        'logo-bug-href'           : '104116116112058047047119119119046097099099101115115105098105108105116121111122046099111109046097117047112114111100117099116115047111122112108097121101114047',

        //ozplayer logo-bug image data
        //nb. this is encoded as base64 image data then applied via scripting
        //so the user can't get rid of it just by deleting an image file
        'logo-bug-data'           : 'iVBORw0KGgoAAAANSUhEUgAAAGoAAAAYCAYAAAASy2hdAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAABPBJREFUeNrsWUFy2kAQlFx+gC4+R35B5IrvFi/AvMBwwcfACxxeABztC8oLwC8A7k5ZeQHK2QfrB8oM6SXjzUpaCTkVUkzVlIy0mtVuz/TMrB2nn72Szp2j/NNySupB/6q8vLyEdAnFrZh0dXZ2ljZgV0pCNpOcsQE9iw8FqJ3cOxkvMrh13Mk7AnRNlzGpb3ic0vMpbd6XmgDNTHbp2YouHeUE2lj3EIA60X7f8SYSYME7gcQAMc3yxvVIR6QRA4QhHNl3NG5Ww3yYA756tiS7nsXYgwBKiZd9ug9Jxw2CxFEyYIDIs1kjjhz+m+6dky7E8C7G1xGmT5eV/r4QdgPMf5ByUvCMo2tAYAUNgBTCHoMT6c+Zkkg7iLTd/PTeXl7P+Qd2FVjtQy4mysR7+kUTweVbr68in3F9LBnH0fUsipsu6RdQVp7DxBYFyJD0usCGdCoPY5WTLEwFB8Z5pkKFixQUMal23xd2k5x3fb4vx9Lv1YnlRm9zCwOW9YkW+05QIZrUwh0tYkwRkGgUeIX3lzk6s4ysBFWlTQ59xXqvSG/Ycej+MzZfjWMH2sCR3jAHj4WzBQbq34hv38COej4gfQXtd+VYtmkLlPJwH5vzTGDZ0lJV6pxqv2cFNjoVy/mFRQ5luSC7LdJzOFegOcUsp6UJTd+K4ugzInsk7Qh6b8NmG2NHosjyT2vQ2A607GlrkNE/dy+d1BK0sqiK6eNTMc9UA8/DRo1yeqAAXt1R1IIcGYBa80Tlr0ijpHUeABXakS7Aj3EvRdQq55fzeXAQHpcgsod1gNI3fps/+k/bCdsPl06npIReWdiNVTPM/GzwTq7sJgWOFIBaFvDKLqrNIvpbweNvQEEe3k323KM7fG+szbVryPUGXThthPbFOXGaE+bzawJMPxlItTFVZK2BNACAPcv3VVHQMlWbmnxFjyc93KsbSSI/BwXF1Sjv1KRO1beXgMoSbIDPidJi0/7IKUjmY1BIGc22yo6PDBu6xMZNBF2OEd3dPRhnd8U8MzgbU7N1Fd1kRLFHLoj6VjnPdhWkrKByNi2UdIF77O1Dm7M5pkuoLW2FiJ4Pmg1umH80sDcerWGOavA753QFEu+FTb+4L1AxqC0mgKKC/DTR6GRpODyVrQCP7WhVVlyQl/YVX5yIVKG6D2UOo9HwEKcxqaDymY1D1aE+RTsJVXpDJOAyD+fD1g7oxRNgrdAEx4K7fe0AdYBFMoUuTXmsziGugWLH4rumSPhteeykmlE4kg9gf2BsmJODJ8LGHGtWzuEJmm4kolJRkXAiv3AfqlVDoKyWVuWoPKCawASJP9byhOL50KCLguKlTBLREPdExN/he0JstLKrom2kVXVLgGpy2pFW5YWCalsGKk/2iSj+gK+XbORhR3m1CgvmZ3TeH7HwFLwdGSjA1zbFdHwUCxruOXbHXDHK9UiWwvD2LijtO0pjT1RoqRibiCZ1jXuhNoeDd1ropwKse431Sqd6LM7B/Swj3VLKvZMtSTP+v1T26X5JmjVxKPs/CjbeMRwhZaSbpucroj725In77TY+wmIEaS7P6rSiZNT0nHnUlwKg1REWo8zEWd0V2g8P+TSq0CfWjij2hOGt4x6jqFh6omjpopiYA6Tee0zobnMUR86D2zruf+XjIXVExaAtKjTYtagvrVjSHuV3NRf9rfl+CjAAZcZj0QHAg/8AAAAASUVORK5CYII=',

        //### PHP ###// <?php endif; ?>


        //user data persistence base key, or empty string for no persistence
        //nb. any non-empty value will be used as a storage key,
        //to record user settings and persist them between page views
        'user-persistence'        : 'ozplayer-userdata',

        //additional user data persistence keys for specific values
        //nb. this is added to the base key to store individual values
        'user-volume'             : '-volume',
        'user-pin'                : '-pin',

        //video and audio default volume (float from 0 to 1)
        'default-volume'          : 0.7,


        //add a fullscreen button to the controls, if the browser supports it
        'allow-fullscreen'        : true,

        //default video size (px) when the width and height are not defined
        //nb. this width is designed to provide enough minimum space
        //for all the supported controls when images are disabled
        //while the height maintains a widescreen aspect ratio of 16:9
        'default-width'           : 400,
        'default-height'          : 225,

        //smallscreen and midscreen threshold widths (lt px)
        //for application of "smallscreen" and "midscreen" classes
        'smallscreen-threshold'   : 400,
        'midscreen-threshold'     : 480,

        //absolute minimum width (px) when the smallscreen layout is used
        //nb. the css also defines a min-width and min-height which effectively
        //constrains the absolute minimum even if this value is set lower
        'smallscreen-minwidth'    : 300,


        //maximum seek resolution, ie. the maximum number of steps in the slider
        //nb. I got this figure from observing what BBC iPlayer does, and it
        //means that the longer the duration is, the higher the step will be
        //or for anything less than 10 minutes the step will be 1 second
        'seek-resolution'         : 600,

        //seek duration (seconds) when using the forward and rewind buttons
        'seek-duration'           : 15,

        //synchronisation resolution (s) for audio descriptions
        //ie. the maximum amount of drift that can occur between the
        //video and audio currentTime before the audio time is adjusted
        //nb. this should be set to the slowest value we can get away with
        //because syncing causes jitteriness or loss of sound in the audio
        //so we want to avoid doing that unless it's absolutely necessary
        'sync-resolution'         : 0.3,

        //synchronisation frequency (s) for audio description timeupdate events
        //ie. how often during timeupdate events does synchronisation occur
        //(see media timing and synchronisation timeupdate event for more notes)
        //nb. likewise this should be the slowest value that's reasonable
        //slower means fewer synchronisations and therefore less loss of sound
        //due to that, but too slow would mean that it has too long to remain
        //out of sync in cases where the audio has to load while the video is
        //playing and we have nothing else to re-sync when its loading is complete
        'sync-frequency'          : 9,


        //auto-hiding delay and transition speed (s) for stack controls and skip links
        //nb. first of these controls how long the player will wait without
        //user interaction when hiding stack controls, while the second controls
        //how long after that before it should apply the fully hidden class
        //nb. the second value should match or exceed the speed of the CSS hiding transition
        //and only applies to stack controls, it's not used by the skip links
        'auto-hiding-delay'       : 4,
        'auto-hiding-speed'       : 0.5,

        //loading indicator spinner speed (ms)
        'indicator-speed'         : 125,

        //rate and pre-delay for controlled key-repeats (milliseconds)
        //nb. these speeds are very close to the native repeat-rate for most browsers
        //and it's a shame we can't actually hook into that system configuration
        //but we can't just allow native repeats on actions like slider movement
        //because that could cause a bottleneck of events that can't be managed
        //nb. a rate of zero means don't repeat, a delay of zero means no repeat delay
        //but having a delay is strongly recommended because it improves usability
        //by preventing repeats from happening when the user doesn't want them
        //ie. you have to hold the key down with intent before it happens
        'ke\y-repeat-rate'        : 60,
        'ke\y-repeat-delay'       : 500,

        //tooltip show and hide buffers (milliseconds) to prevent drive-by triggering
        //and to keep them on the screen for a minimum length of time once triggered
        //nb. the show delay applies to mouseover and focus triggers, but once you
        //actually click or move the slider or button, the tooltip will show immediately
        //so we have quite a slow show delay, which is more like native tooltips
        'tooltip-show-delay'      : 400,
        'tooltip-hide-delay'      : 2500,

        //programatic element IDs
        ids :
        {
            //media wrapper (video or plugin wrapper) ID template,
            //which is parsed with the player instance ID if the element
            //doesn't already have an ID, so that we can use it
            //to create a fragment-ID action for the form
            'video'                   : '%id-ozplayer-video',

            //custom slider instance ID template,
            //which is parsed with the player instance ID and the
            //range input field class to create the slider instance ID
            'slider'                  : '%id-%field',

            //custom slider container and thumb ID templates
            //which are parsed with the control ID to create the component ID
            //nb. these are primarily used to make label "for" associations
            'slider-container'        : '%id-slider',
            'slider-thumb'            : '%id-slider-thumb',

            //transcript cue id prefix for additional transcript data
            //nb. this is prefixed to every additional transcript cue id
            //to make sure there's no duplication with the caption ids
            //which would otherwise happen if both used numeric ids
            'transcript-id-prefix'    : 'T-'
        },

        //programatic element classes
        classes :
        {
            //player container
            'container'               : 'ozplayer',

            //static fallback content
            'fallback'                : 'ozplayer-fallback',

            //optional transcript container
            'transcript'              : 'ozplayer-transcript',

            //optional transcript expander
            'expander'                : 'ozplayer-expander',


            //additional container class when images are disabled
            //and/or a high-contrast windows theme is in use
            //or browser settings have disabled author colors
            'no-images'               : 'oz-no-images',

            //additional container classes for large controls and stack layout
            //and also for pinned controls when activated by the pin button
            //nb. "large" and "stack" only affect the controls and captions
            //but we need them on the container for descendent selectors
            //nb. we also need separate hiding and hidden classes, because
            //the former triggers a transition to hide the stack, while
            //the latter is added for other adjustments after it's gone
            //nb. the pinned class is used to negate control hiding classes
            'large-controls'          : 'oz-large',
            'stack-controls'          : 'oz-stack',
            'pinned-controls'         : 'oz-pinned',

            //auto-hiding and hidden classess for stack controls and skip links
            //nb. this is either an additional container class or a controlform class
            'auto-hiding'             : 'oz-auto-hiding',
            'auto-hidden'             : 'oz-auto-hidden',

            //additional container container fullscreen class
            'container-fullscreen'    : 'oz-fullscreen',

            //additional container classes when responsive layout is used
            //nb. "responsive" is added as soon as the responsive attribute is parsed
            //and overrides the static min-width and min-height to allow smaller defaults
            //whereas "smallscreen" or "midscreen" are added or removed when responsive events are called
            //(and immediately after the controls have been built whether or not responsive is used)
            //as applicable to the video width compared with the smallscreen and midscreen thresholds
            'responsive'              : 'oz-responsive',
            'smallscreen'             : 'oz-smallscreen',
            'midscreen'               : 'oz-midscreen',

            //additional container class for the audio-only player
            'audio-only'              : 'oz-audio',


            //skip link list
            'skip-link-list'          : 'oz-skip-links',

            //skip link individual items
            'skip-link-video'         : 'oz-skip-video',
            'skip-link-transcript'    : 'oz-skip-transcript',

            //skip link anchors
            'skip-link-anchor'        : 'oz-skip-anchor',

            //logo-bug
            'logo-bug'                : 'oz-logo-bug',

            //poster overlay
            'poster'                  : 'oz-poster',

            //captions container
            'captions'                : 'oz-captions',

            //captions container => spacing blocks
            'captions-spacing'        : 'oz-captions-spacing',

            //player indicator and state classes
            'indicator'               : 'oz-indicator',
            'indicator-loading'       : 'oz-loading',
            'indicator-timeout'       : 'oz-timeout',
            'indicator-bsod'          : 'oz-bsod',

            //player authentication messages
            'indicator-message'       : 'oz-message',

            //controls
            'controls'                : 'oz-controls',

            //controls => general field wrapper classes
            'field-wrapper'           : 'oz-field',
            'first-field-wrapper'     : 'oz-first-field',
            'last-field-wrapper'      : 'oz-last-field',

            //controls => specific field wrapper classes
            'field-seek'              : 'oz-seek',
            'field-playpause'         : 'oz-playpause',
            'field-mute'              : 'oz-mute',
            'field-volume'            : 'oz-volume',
            'field-cc'                : 'oz-cc',
            'field-ad'                : 'oz-ad',
            'field-fullscreen'        : 'oz-fullscreen',
            'field-spacer'            : 'oz-spacer',
            'field-rewind'            : 'oz-rewind',
            'field-forward'           : 'oz-forward',
            'field-pin'               : 'oz-pin',

            //controls => field state classes
            //eg. playpause is "on" when it's playing or "off" when it's paused
            'field-state-off'         : 'oz-off',
            'field-state-on'          : 'oz-on',
            'field-state-low'         : 'oz-low',
            'field-state-high'        : 'oz-high',

            //controls => menu classes
            'menu-wrapper'            : 'oz-menu',
            'menu-item'               : 'oz-menuitem',

            //controls => custom slider component class names
            'slider-container'        : 'oz-slider',
            'slider-track'            : 'oz-slider-track',
            'slider-thumb'            : 'oz-slider-thumb',
            'slider-tooltip'          : 'oz-slider-tooltip',

            //controls => custom button tooltips
            'button-tooltip'          : 'oz-button-tooltip',

            //controls => buffer time-range indicators
            'buffer-time-range'       : 'oz-timerange',

            //general purpose state classes
            'state-visible'           : 'oz-visible',
            'state-hidden'            : 'oz-hidden',
            'state-disabled'          : 'oz-disabled'
        },

        //programatic language
        //nb. all string values are trimmed by define(), so if leading or
        //trailing space is required, use unicode non-breaking spaces (\u00a0)
        //nb. some internal spaces and names are escaped to avoid compression
        lang :
        {
            //controls => button labels and tooltips
            //indexed by button name and state key (eg. "playpause" and "on")
            //nb. rewind and forward are stateless buttons which are always off
            "button-playpause-off"    : "Play",
            "button-playpause-on"     : "Pause",
            "button-mute-off"         : "Mute",
            "button-mute-on"          : "Unmute",
            "button-cc-off"           : "Captions are off",
            "button-cc-on"            : "Captions are on",
            "button-cc-lang"          : "Captions are\ %1",
            "button-cc-loading"       : "Loading captions ...",
            "button-cc-nolang"        : "%1 failed to load",
            "button-cc-error"         : "Captions are not available",
            "button-ad-off"           : "Audio Descriptions are off",
            "button-ad-on"            : "Audio Descriptions are on",
            'button-ad-loading'       : "Loading audio descriptions ...",
            'button-ad-error'         : "Audio Descriptions are not available",
            "button-fullscreen-off"   : "Fullscreen",
            "button-fullscreen-on"    : "Exit Fullscreen",
            "button-rewind-off"       : "Back\ %2 seconds",
            "button-forward-off"      : "Forward\ %2 seconds",
            "button-pin-off"          : "Pin the controls",
            "button-pin-on"           : "Unpin the controls",

            //controls => fallback text (eg. for styled no-images)
            "text-playpause-off"      : "Play",
            "text-playpause-on"       : "Pause",
            "text-mute-off"           : "Mute",
            "text-mute-on"            : "Unmute",
            "text-cc-off"             : "CC\ (off)",
            "text-cc-on"              : "CC\ (on)",
            "text-cc-lang"            : "CC\ (%1)",
            "text-cc-loading"         : "CC\ (...)",
            "text-tr-off"             : "TR\ (off)",
            "text-tr-on"              : "TR\ (on)",
            "text-tr-lang"            : "TR\ (%1)",
            "text-tr-loading"         : "TR\ (...)",
            "text-ad-off"             : "AD\ (off)",
            "text-ad-on"              : "AD\ (on)",
            "text-fullscreen-off"     : "Full",
            "text-fullscreen-on"      : "Exit",
            "text-rewind-off"         : "-%2",
            "text-forward-off"        : "+%2",
            "text-pin-off"            : "Pin",
            "text-pin-on"             : "Unpin",

            //controls => menu labels
            "menu-cc-off"             : "Off",

            //controls => slider tooltips
            'slider-seek'             : 'Time\ =\ %1',
            'slider-volume'           : 'Volume\ =\ %1',

            //skip links text
            'skip-link-video'         : 'Skip video',
            'skip-link-transcript'    : 'Skip to transcript',

            //logo-bug link text
            'logo-bug-text'           : 'About OzPlayer',

            //loading indicator aria-live messages
            'indicator-loading'       : 'Buffering ...',
            'indicator-timeout'       : 'Media failed to load.',
            'indicator-unlicensed'    : 'This copy of OzPlayer is unlicensed.',

            //transcript language, loading and error messages
            "transcript-off"          : "Transcript is off",
            "transcript-lang"         : "Transcript\ =\ %1",
            'transcript-loading'      : 'Loading transcript ...',
            "transcript-nolang"       : "%1 failed to load.",
            'transcript-error'        : 'Transcript is not available.',

            //end of transcript message
            'transcript-end'          : 'End of transcript.',

            //transcript active-cue label and glyph
            'transcript-cue-label'    : 'Current line',
            'transcript-cue-glyph'    : '\u2192',

            //transcript expander twisty glyphs
            'expander-open'           : '\u25bc',
            'expander-closed'         : '\u25ba',

            //console message prefixes
            'console-prefix-info'     : 'OzPlayer Information \u2014\u0020',
            'console-prefix-warn'     : 'OzPlayer Warning \u2014\u0020',
            'console-prefix-error'    : 'OzPlayer Error \u2014\u0020',

            //definition errors
            'define-bad-group'        : 'There is no option-group "%group".',
            'define-bad-option'       : 'There is no option "%option".',
            'define-bad-type'         : 'The value for "%option" must be %type.',
            //*** it doesn't seem like we're still using this (unless its key is compiled from vars)?
            //*** or maybe it was only used when validating the logo-bug-href
            //*** which can't be defined anymore therefore we don't need it?
            'define-bad-href'         : 'The "%option" must be an absolute URL,\ beginning with http:\/\/\ or https:\/\/',
            'define-too-late'         : 'You can\'t define c\onfig or \lang once a p\layer has been initialised.',

            //option type descriptions for definition errors
            //nb. each of these is defined with its own singular pronoun
            //because I can't see how that could be specified more generaly
            //since "a" and "an" variants won't occur in every language,
            //and when they do, they won't necessarily match the same words
            //nnb. actually, for most applications I just hard-code errors in English
            //but in this case it seemed more appropriate to define them in lang
            'define-array'            : 'an array',
            'define-string'           : 'a string',
            'define-boolean'          : 'a boolean',
            'define-number'           : 'a number',
            'define-function'         : 'a function',

            //constructor errors
            'constructor-no-id'       : 'Please specify a p\layer ID.',
            'constructor-bad-id'      : 'There is no p\layer with the ID "%id".',
            'constructor-dupe-id'     : 'A p\layer with the ID "%id" has already been initialised.',
            'constructor-bad-class'   : 'The p\layer with the ID "%id" does not have the class "%name".',
            'constructor-no-element'  : 'The p\layer with the ID "%id" has no m\edia element.',
            'constructor-not-new'     : 'The OzPlayer.Video function must be called with the "new" keyword.',
            'constructor-not-new-audio': 'The OzPlayer.Audio function must be called with the "new" keyword.',

            //batch initialisation warnings
            'batch-no-id'             : 'Batch initialisation found a p\layer with no ID.',
            'batch-bad-id'            : 'Batch initialisation found a p\layer with a duplicate ID.',
            'batch-no-found'          : 'Batch initialisation found no valid p\layers.',

            //addListener warnings
            'event-no-fn'             : 'addListener requires a callback function.',
            'event-bad-args'          : 'addListener was called with invalid arguments.',
            'event-bad-type'          : 'addListener does not recognise the \"%type\" event.',

            //player option and attribute errors
            'option-bad-callback'     : 'The "%option" callback for #%id must be\ %type.',
            'option-bad-controls'     : 'The "data-controls" attribute for #%id must be "row" or "stack".',
            'option-bad-transcript'   : 'The "data-transcript" element for #%id does not exist.',
            'option-wrong-transcript' : 'The "data-transcript" element for #%id must be outside the p\layer.',
            'option-busy-transcript'  : 'The "data-transcript" element for #%id is already being used by #%other.',

            //transcript errors and warnings
            'option-class-transcript' : 'The transcript element for #%id does not have the class "%name".',
            'option-class-expander'   : 'The transcript\ <details>\ element for #%id is missing its "ozplayer-expander" class.',

            //transcript expander initialisation warning
            'expander-warning'        : 'Unable to create transcript expander because its tr\igger element is missing or misplaced.',

            //responsive video dimensions
            'option-bad-responsive'   : 'The "data-responsive" element for #%id does not exist.',
            'option-wrong-responsive' : 'The "data-responsive" element for #%id must be outside the p\layer.',
            'option-bad-responsive-mode': 'The "data-responsive-mode" attribute for #%id must have the value "min",\ "max" or "initial".',

            //mediaelement path error
            'path-failure'            : 'Unable to determine path to \/ozplayer-core\/. Ensure that mediaelement.min.js is loaded via\ <script src>.',

            //media wrapper failure warning
            'wrapper-failure'         : 'Failed to initialize the media.',

            //vtt loading and parsing errors
            'vtt-load-failure'        : 'VTT file failed to load\ [%status].\n<%src>',
            'vtt-no-usable-cues'      : 'VTT file contained no usable cues.\n<%src>',
            'vtt-invalid-cue'         : 'Invalid cue in VTT file.\n<%src>',
            'vtt-invalid-xad'         : 'Invalid XAD c\ommand in VTT file.\n<%src>'
        }

    },



    //-- private => player dictionaries --//

    //players dictionary, which will reference all the player instances,
    //indexed by the <video> ID that's passed to the Video constructor
    players = {},

    //events dictionary, indexed by supported event types
    //see the addListener code for notes about this
    events = (function()
    {
        var e = {};
        etc.each(defs.events, function(a)
        {
            e[a] = [];
        });
        return e;

    }).apply($this),

    //sliders dictionary, which will reference all the custom sliders,
    //indexed by the ID of its underlying control (which is based on the player ID)
    sliders = {},

    //reference to whichever player has fullscreen mode, or null if none do
    //see the fullscreen handling code for notes about this
    screenplayer = null,







    //-- private => bespoke utilities --//
    library =
    {

        //detect whether images are enabled in the browser
        //and use that state to manage the container no-images class
        //as well as a player images flag for easier reference later
        //nb. since the detection process is asynchronous in some browsers
        //we can't return, so we just add the class directly as soon as we can
        //which is then used in CSS to adjust the appropriate styles
        //but the process is not guaranteed, so we must assume
        //no image support and add the no-images class by default
        //then remove it again as soon as we've established support
        //and we must also use that class to negate images, so there's
        //no possibility of seeing fallback text as well as images
        applyImageSupport : function(player)
        {
            //Safari and Edge don't have a user setting to disable images
            //(there is a dev setting for it in safari, but that's just a dev setting)
            //furthermore the process we're using is unreliable on iOS
            //and may require a double refresh to work on desktop safari
            //and there's no longer any way of detecting it in firefox afail
            //so, if this is one of them, just assume image support and exit
            if(defs.agent.safari || defs.agent.edge || defs.agent.firefox)
            {
                return (player.images = true);
            }

            //else add the no-image class to the player container by default
            //unless this is webkit, because the default no-image styles
            //cause focus displacement when the class is removed again
            //so we just have to use the inverse approach for webkit
            //and then set the default image flag accordingly
            //this is also what we do for IE11 because nothing else works
            //and although IE11 probably doesn't need an inverse condition
            //there's no point defining another fork just for that difference
            if(!(defs.agent.webkit || defs.agent.ie11p))
            {
                etc.addClass(player.container, config.classes['no-images']);
                player.images = false;
            }
            else
            {
                player.images = true;
            }


            //define a data URI that we'll use for several browsers
            //nb. the escapes in the value are to support compression
            //ie. to avoid the slashes being treated as part of a comment
            var datauri = 'data:image/gif;base64,R0lGODlhAQABAIAAAP\/\/\/wAAACH5BAEAAAAALAAAAAABAAEAQAICRAEAOw==';

            //for webkit browsers or IE11, create an image with a data URI, and that will
            //have a width of zero if images are disabled, or greater if they're enabled
            //except that we have to pause for a moment before reading the properties
            //nb. 10ms wasn't enough, but 100ms always was, so let's double that for safety
            if(defs.agent.webkit || defs.agent.ie11p)
            {
                var img = new Image;
                img.src = datauri;
                etc.delay(200, function()
                {
                    //nb. remember that we're doing this inversely, so we
                    //only pass this condition if images are NOT enabled
                    if(img.width == 0)
                    {
                        //set the images flag and add the no-images class
                        player.images = false;
                        etc.addClass(player.container, config.classes['no-images']);

                        //then if we've rendered the sliders in the meantime
                        //(which we can detect from the presence of the seek slider)
                        //udpate their dynamic widths with the stable button sizes
                        if(player.controlform && player.controlform.seek && sliders[player.controlform.seek.id])
                        {
                            updateSliderStretch(player);
                        }

                        //then if we have the logo-bug, negate its backgroundImage
                        if(player.logo)
                        {
                            player.logo.style.backgroundImage = 'none';
                        }
                    }

                    //however there are times when the previous logic fails,
                    //eg. when loading a new page after having cleared the cache
                    //so we add an additional load event to remove the class again
                    //which this will fire if images are supported, but never will if not
                    //nb. although actually I haven't been able to re-create the original problem
                    //it all seems fine without this now, but let's have it anyway jic
                    //nb. this syntax is to avoid compression from the etc.load function
                    //which is identified by "load = function("
                    img['onload'] = function()
                    {
                        //set the images flag and remove the no-images class
                        player.images = true;
                        etc.removeClass(player.container, config.classes['no-images']);

                        //then if we've rendered the sliders in the meantime
                        //(which we can detect from the presence of the seek slider)
                        //udpate their dynamic widths with the stable button sizes
                        if(player.controlform && player.controlform.seek && sliders[player.controlform.seek.id])
                        {
                            updateSliderStretch(player);
                        }

                        //then if we have the logo-bug, restore its backgroundImage
                        if(player.logo)
                        {
                            player.logo.style.backgroundImage = 'url("data:image/png;base64,' + config['logo-bug-data'] + '")';
                        }
                    };
                });
            }
        }


        //check the type of a media element or its collection of sources
        //against the types that the browser supports, and return the first match
        //of if we fail to find any matching types, return null for failure
        //nb. we also have a condition to match the fake mime-types used for
        //youtube, facebook etc, and also the application mime-types for HLS and DASH
        //nb. if a media element has both an src and sources, the sources are ignored
        //nb. we can't test media elements or sources which have no type attribute
        //and if there's no src or source elements then we return null
        , getSupportedType : function(media, type)
        {
            function yesCanPlay(attr)
            {
                //*** DEV TMP
                //console.log('yesCanPlay("' + attr + '") = ' + media.canPlayType(attr));

                //return true for third-party or application types that ME4 can handle
                //otherwise return according to the browser's reported support for that type
                //nb. beware of semi-colon insertion :-O
                return (
                    library.isThirdPartyMedia(attr)
                    ||
                    (/^application\/(x\-mpegURL|dash\+xml)/i.test(attr))
                    ||
                    (etc.def(media.canPlayType) && (/^(maybe|probably)$/i.test(media.canPlayType(attr))))
                    );
            }
            if(media.getAttribute('src'))
            {
                if(yesCanPlay(type = media.getAttribute('type')))
                {
                    return type;
                }
                return null;
            }
            else
            {
                etc.each(etc.get('source', media), function(source)
                {
                    if(yesCanPlay(type = source.getAttribute('type')))
                    {
                        return false;
                    }
                    else { type = null; }
                });
                return type || null;
            }
        }


        ////get the base volume value defined in a data-volume atttribute
        ////parsed to a float or normalised to 1 for undefined or unparseable values
        //, getBaseVolume : function(media)
        //{
        //    var v = parseFloat(media.getAttribute('data-volume'));
        //    if(isNaN(v))
        //    {
        //        v = 1;
        //    }
        //    return v;
        //}


        //replace the video with the fallback content in response to a terminal init failure
        //(ie. effectively bringing it out from inside the video, then removing the video)
        , getVideoFallback : function(media)
        {
            etc.each(etc.get('*', media), function(node)
            {
                if(etc.hasClass(node, config.classes['fallback']))
                {
                    etc.build(node, { '=replace' : media });
                    return false;
                }
            });
        }

        //test a video type to determine whether it's a third-party embedded format
        //such as youtube, facebook or vimeo, rather than a native or shim format
        , isThirdPartyMedia : function(type)
        {
            return (/^(video\/(x-)?)?(youtube|facebook|vimeo)$/i.test(type));
        }


        //convert a cue timestamp in "(hh:)?mm:ss[.,]uuu" format
        //to an absolute offset in seconds[.milliseconds]
        //nb. allow for the european decimal comma to support SRT
        , getStampTime : function(stamp)
        {
            if((stamp = etc.trim(stamp).split(':')).length < 3)
            {
                stamp.splice(0, 0, '00');
            }
            return (parseInt(stamp[0], 10) * 3600) + (parseInt(stamp[1], 10) * 60) + parseFloat(stamp[2].replace(',','.'));
        }

        //convert a value in seconds[.milliseconds] to a timestamp in "(hh:)?mm:ss" format
        , getTimeStamp : function(time)
        {
            var
            time = Math.ceil(time),
            h = Math.floor(time / 3600),
            m = (m = Math.floor((time % 3600) / 60)) < 10 ? ('0' + m) : m,
            s = (s = time % 60) < 10 ? ('0' + s) : s;

            return (h > 0 ? (h + ':') : '') + m + ':' + s;
        }


        //save a simple value to local storage, or to a cookie if that's not supported
        //nb. the value is saved using a combination of the base key plus single value key
        //or if the base key is null then we just return null without saving anything
        , addStorageValue : function(basekey, key, value)
        {
            //so if the base key is null, just return null for failure
            if(basekey === null) { return null; }

            //[else] add the keys together to create the storage key
            //nb. re-using the basekey var because its name gets compressed
            basekey += key;

            //*** DEV TMP
            //if(__.console) { console.log('addStorageValue(basekey="'+basekey+'", key="'+key+'", value="'+value+'")'); }

            //then if local storage is supported, try to save the value with the specified key
            //and if that's okay then return the value, or return null for failure if not
            //nb. adding to storage will throw a value if the quota has been exceeded
            //nb. using square-bracket notation allows us to save and return it in one expression
            if(etc.def(__.localStorage))
            {
                try
                {
                    return __.localStorage[basekey] = value;
                }
                catch(ex) { return null; }
            }

            //[else] if cookies are supported, try to save the value with the specified key
            //using a 1-year expiry date and setting the path to root
            //and if that's okay then return the value, or return null for failure if not
            //nb. if cookies are supported but disabled, the value won't be saved
            //which means that the subsequent read will simply return no value
            //there's no known failure condition, but it's better to uber safe
            if(etc.def(_.cookie))
            {
                try
                {
                    return _.cookie = basekey + '=' + value
                            + '; expires=' + new Date(new Date().getTime() + 31536000000).toGMTString()
                            + '; path=/';
                }
                catch(ex) { return null; }
            }

            //[else] just in case that's not supported either, return null for no data
            //nb. there's no failing browser, but it's better to be uber safe
            //in case of some external plugin that delete the cookie object or some shit
            return null;
        }

        //get a simple value from local storage or cookie data, as supported
        //nb. the value is retrieving using a combination of the base key plus single value key
        //or if the base key is null then we just return null as though there were no data
        , getStorageValue : function(basekey, key)
        {
            //so if the base key is null, just return null for no data
            if(basekey === null) { return null; }

            //[else] add the keys together to create the storage key
            //nb. re-using the basekey var because its name gets compressed
            basekey += key;

            //*** DEV TMP
            //if(__.console) { console.log('getStorageValue(basekey="'+basekey+'", key="'+key+'")'); }

            //then if local storage is supported, look for a value with the specified key
            //and that will either return the value, or null if there is no such value
            //nb. we need to use exception handling to cater for older versions of firefox
            //in which localStorage is technically supported but getItem sometimes throws an error
            if(etc.def(__.localStorage))
            {
                try
                {
                    return __.localStorage.getItem(basekey);
                }
                catch(ex) { return null; }
            }

            //[else] if cookies are supported, look for a value with the specified key
            //and if we have one then parse and return else, else return null for no value
            //nb. if cookies are supported but disabled, we'll end up returning no value
            if(etc.def(_.cookie))
            {
                if(_.cookie.indexOf(basekey + '=') >= 0)
                {
                    return _.cookie.split(basekey + '=')[1].split(';')[0];
                }
                return null;
            }

            //[else] just in case that's not supported either, return null for no data
            //nb. there's no known failing browser, but it's better to be uber safe
            //in case of some external plugin that deletes the cookie object or some shit
            return null;
        }


        //feature test the video for a supported fullscreen model
        //and return a reference key, or null for no support
        , getFullscreenModel : function(video)
        {
            //assume no support by default
            var screentype = null;

            //video-only fullscreen for webkit (iOS)
            if(etc.def(video.webkitEnterFullscreen))
            {
                screentype = 'webkit-video';
            }

            //player fullscreen for webkit (safari, legacy chrome, legacy edge)
            //nb. more recent versions of webkit support this in addition to
            //still supporting the video-only fullscreen from earlier versions
            //which is why this has to be an if condition rather than else if
            if(etc.def(video.webkitRequestFullScreen))
            {
                screentype = 'webkit-screen';
            }

            //player fullscreen for ms (ie11)
            else if(etc.def(video.msRequestFullscreen))
            {
                screentype = 'ms-screen';
            }

            //player fullscreen for moz (legacy firefox)
            else if(etc.def(video.mozRequestFullScreen))
            {
                screentype = 'moz-screen';
            }

            //player fullscreen with the standard model (firefox, chrome, chromium edge)
            //nb. test for this at the end with an if condition, so that
            //it's used by browsers which support it despite also supporting
            //an older proprietary syntax; this is essential in recent versions
            //of firefox, because they still report support for mozRequestFullScreen
            //but if we actually try to use that it fails with a deprecation warning
            if(etc.def(video.requestFullscreen))
            {
                screentype = 'screen';
            }

            //return the detected model (or null);
            return screentype;
        }

        //check whether the video or document is currently displaying in fullscreen
        , isFullscreen : function(video, screentype)
        {
            if(screentype == 'webkit-video')
            {
                return video.webkitDisplayingFullscreen;
            }
            else if(screentype == 'webkit-screen')
            {
                return _.webkitIsFullScreen;
            }
            else if(screentype == 'moz-screen')
            {
                return _.mozFullScreen;
            }
            else if(screentype == 'ms-screen')
            {
                return _.msFullscreenElement !== null;
            }
            else if(screentype == 'screen')
            {
                return _.fullscreenElement !== null;
            }
        }

        //set the video or container to fullscreen, using the supported model
        //nb. use silent exception handling here just in case a fullscreen model
        //is supported, but fails on a specific video (because of user config or whatever)
        //(* or those fullscreenEnabled flags that don't seem to be required! *)
        , enterFullscreen : function(video, container, screentype)
        {
            try
            {
                if(screentype == 'webkit-video')
                {
                    video.webkitEnterFullscreen();
                }
                else if(screentype == 'webkit-screen')
                {
                    container.webkitRequestFullScreen();
                }
                else if(screentype == 'moz-screen')
                {
                    container.mozRequestFullScreen();
                }
                else if(screentype == 'ms-screen')
                {
                    container.msRequestFullscreen();
                }
                else if(screentype == 'screen')
                {
                    container.requestFullscreen();
                }
            }
            catch(ex){}
        }

        //exit video or document fullscreen, using the supported model
        //nb. also use silent exception handling here, generally just in case
        //nb. we had to change this function name from "exitFullscreen"
        //because that's the same name as the standard implementation uses
        //and that would mean that the standard name gets compressed
        , leaveFullscreen : function(video, screentype)
        {
            try
            {
                if(screentype == 'webkit-video')
                {
                    video.webkitExitFullscreen();
                }
                else if(screentype == 'webkit-screen')
                {
                    _.webkitCancelFullScreen();
                }
                else if(screentype == 'moz-screen')
                {
                    _.mozCancelFullScreen();
                }
                else if(screentype == 'ms-screen')
                {
                    _.msExitFullscreen();
                }
                else if(screentype == 'screen')
                {
                    _.exitFullscreen();
                }
            }
            catch(ex){}
        }

    };







    //-- public => dynamic video constructor --//

    //video constructor
    $this.Video = function(id, options, container)
    {
        //if the supported flag is false, just silently exit
        if(!$this.supported) { return; }

        //[else] check that this function is being called as a constructor
        //otherwise the instance reference may not point to the correct instance
        //and if not, show a console error and return false for failure
        if(this.constructor !== $this.Video)
        {
            return etc.console(config.lang['constructor-not-new'], 'error');
        }

        //[else] if the id is undefined, null, empty or only whitespace,
        //show a console error and return false for failure
        //else look for a player container with the specified string ID
        //and if we don't find one, or it has the wrong class, show a console error and exit
        if(etc.empty(id, true))
        {
            return etc.console(config.lang['constructor-no-id'], 'error');
        }
        else if(!(container = etc.get('#' + (id = id.toString()))))
        {
            return etc.console(etc.sprintf(config.lang['constructor-bad-id'], { id : id }), 'error');
        }
        else if(!etc.hasClass(container, config.classes['container']))
        {
            return etc.console(etc.sprintf(config.lang['constructor-bad-class'],
            {
                id      : id,
                name    : config.classes['container']

            }), 'error');
        }

        //[else] if we already have a player with this ID
        //show a console error and return false for failure
        if(etc.def(players[id]))
        {
            return etc.console(etc.sprintf(config.lang['constructor-dupe-id'], { id : id }), 'error');
        }


        //save the ID as a public instance property
        //then create a new player object and save it to the
        //global dictionary, and also to a local var for convenience
        var player = players[(this.id = id)] = {};

        //define the default instance mode, which will be
        //the final value if a video element isn't found
        //or if none of the formats or players are supported
        this.mode = 'fallback';

        //define the default instance src, which will also be
        //the final value if we don't find valid media
        //nb. we need this for addListener callbacks
        //so they can be used for analytics tracking
        //but it will also be passed through onsuccess etc.
        this.src = 'none';

        //define the default instance renderer, which will also be
        //the final value if we don't find valid media
        //nb. this is just for info in case it's useful
        this.renderer = 'none';

        //default the default video type, which will be
        //the final value if a video element isn't found
        //or if none of the formats or players are supported
        //and the default audio type likewise, which will
        //stay none if audio descriptions aren't included
        //or if an audio player isn't a supported format
        this.videoType = 'none';
        this.audioType = 'none';

        //save a reference from the player to the instance
        //so we can update its properties from private functions
        player.instance = this;

        //save the player container that was referenced by the ID
        //then get a reference to the video inside the container
        //or failing that, look for an audio element instead
        //or if we don't find either, show a console error and exit
        if(!(player.video = etc.get('video', (player.container = container))[0]))
        {
            if(!(player.video = etc.get('audio', player.container)[0]))
            {
                return etc.console(etc.sprintf(config.lang['constructor-no-element'], { id : this.id }), 'error');
            }
        }

        //else update the video type, which we have to do first
        //because MediaElement will set an "src" on the video element
        //which won't necessarily match the format the browser is actually using
        //(I guess that's part of the way it manages source data for its shims)
        //nb. for the audio-only player this will return the audio type at this point
        //but we can later hotswap the value to audioType and set instance.videoType to null
        player.videoType = player.instance.videoType = library.getSupportedType(player.video);

        //set a flag that indicates whether the media is audio-only, then if that's true
        if(player.isaudio = player.video.nodeName.toLowerCase() == 'audio')
        {
            //add the audio-only class to the container
            etc.addClass(player.container, config.classes['audio-only']);

            //disable fullscreen
            config['allow-fullscreen'] = false;
        }


        //now test for and apply image support, by adding the container no-images
        //class by default, then removing it again once we've established support
        //nb. and we should do this as soon as possible, because some browsers
        //use an asynchronous detection method, so we want to give it
        //a chance to get started while the player initialises, to get
        //the best chance of it finishing by the time the controls are ready
        library.applyImageSupport(player);


        //remove any autoplay attribute, then just in case it's already playing
        //pause it, and then reset the time to zero (if it's in a state to do that)
        //which can only happen with native video, and even then is only likely
        //with a fast connection and/or preload auto and/or pre-cached video
        //nb. the subsequent initialisations will also reset the video and audio
        //but let's do it here anyway in case there's an execution delay with that
        player.video.removeAttribute('autoplay');
        if(etc.def(player.video.readyState) && player.video.readyState >= 2)
        {
            player.video.pause();
            player.video.currentTime = 0;
        }

        //the preload "metadata" setting is interpreted incorrectly in many browsers
        //in IE9/native and firefox/flash it will cause the whole video to be preloaded
        //(ie. it seems not to know any difference between "metadata" and "auto")
        //so since we can't get consistent behaviour it's best to normalize to two settings:
        //=> if the preload attribute is missing, set it to "none" so there's always a value
        //=> if preload is set to "metadata", set it to "auto" for native/flash consistency
        //nb. when preload is "auto" most browsers will preload the entire video
        //but chrome and opera will only preload the first bit (somewhere between 25s and 1m)
        //and mobile browsers (ios and android) will ignore the preload setting entirely
        //treating it as though it's always "none" and not preloading until playback begins
        //nnb. once playback has begun, iPad will continue to load in the background even
        //if subsequently paused, but iPhone will only load while you're actually playing
        if(!player.video.getAttribute('preload'))
        {
            player.video.setAttribute('preload', 'none');
        }
        else if(player.video.getAttribute('preload') == 'metadata')
        {
            player.video.setAttribute('preload', 'auto');
        }

        //remove native controls now that we have JS support
        //nb. but don't do this for iOS because we'll lose the native
        //click to play icon, which would mess with user expectations
        //unless this is iOS with third-party media, in which case we have to
        //otherwise we'll still get the embedded controls for inline youtube
        //(but this won't make any difference to vimeo which is controlled elsewhere)
        //and unless this is the audio-only player because there is no native icon
        //only the native audio interface which is no good for us in this case
        //since we need our interface for transcript language selection and responsive sizing
        //nnb. and since this won't happen for all, we still have to
        //monitor all events that could come from the native controls
        if
        (
            !defs.agent.ios
            ||
            library.isThirdPartyMedia(player.videoType)
            ||
            player.isaudio
        )
        {
            //if this is the audio-only version, hide the underlying audio element
            //otherwise it will still take up container space on the iphone
            if(player.isaudio)
            {
                player.video.style.display = 'none';
            }

            //remove the video controls
            player.video.removeAttribute('controls');

            //in IE11 with JAWS, the native controls are still announced by JAWS
            //when viewing the page for the first time (but not after refreshing)
            //which may be an issue with MSAA, like maybe the native controls are still
            //present in the accessibility API even though they're removed from the DOM
            //not exactly sure why this is happening, but it can be fixed by cloning
            //the current player node and replacing the original with the clone
            //since the clone has no native controls they won't show up in the API
            //and for safety let's do this for all versions of internet explorer
            //nb. we have to do this before binding any events to the player
            //since any such event listeners would not be preserved in the clone
            if(defs.agent.ie)
            {
                var clone = player.video.cloneNode(true);
                player.container.replaceChild(clone, player.video);
                player.video = clone;
            }
        }

        /*** DEV TMP COMMENTED OUT ***//***
        ***/
        //either way, bind a contextmenu event to prevent them being enabled again
        //filtered by target so it doesn't block the logo-bug link contextmenu
        //nb. I hesitate to do this, but going into full screen using the native
        //controls will only show the video, not the captions or custom controls,
        //so we have to keep that functionality tied to our custom button
        //because then we can control exactly what it is that goes fullscreen
        //nb. this also stops looping from being re-instated via contextmenu
        //nb. for consistency we'll bind this to the whole container, so there's
        //no discrepancy between the poster and the video (which would have different context menus)
        //and cancel bubble as well as preventing default to make that robust
        //nb. we also do the same thing to block any native dblclick action
        //which is implemented later in the script (see "global mouse shortcuts")
        //nnb. this won't work for the flash contextmenu, but that doesn't matter
        //since all that menu has is standard flash options (quality, zoom etc)
        //nnb. this also won't prevent iframe context menus for third-party media
        //youtube has its own contextmenu, while facebook and vimeo show the native one
        etc.listen(player.container, 'contextmenu', function(e, thetarget)
        {
            if(!etc.contains(player.logo, thetarget))
            {
                return null;
            }
        });

        //if the video is third-party media, then remove any poster
        //nb. we don't add a poster image for these, for the sake of maintaining
        //user expectation, because people expect to see the familiar default
        //nnb. Android may show a flash of the poster on the video element, for as
        //long as it takes this script to load and the instance to be initialised
        //so it's already too late by now, and it will be covered by the plugin
        //output anyway, but we should still remove it asap for overall consistency
        if(library.isThirdPartyMedia(player.videoType))
        {
            player.video.removeAttribute('poster');
        }

        //ME doesn't have configuration options for vimeo, but we can add
        //query-string values and it will extract and pass them on to the API
        //so add controls=0 to remove the embedded controls and interface
        //(unfortunately this also means we lose the loading spinner)
        //but don't do that for iOS because there's no other way to initiate
        //playback, since our play button doesn't work until first playback
        //so for the iphone and ipad the embedded controls have to show,
        //also for iphone we have to set playsinline according to our attribute
        //nb. take this opportunity to remove any existing query string
        if(/^video\/(x-)?(vimeo)$/i.test(player.videoType))
        {
            etc.each(etc.get('source', player.video), function(node)
            {
                var src = node.src.split('?')[0];
                if(!defs.agent.ios)
                {
                    src += '?controls=0';
                }
                else
                {
                    src += '?playsinline=' + (player.video.getAttribute('playsinline') ? '1' : '0');
                }
                node.setAttribute('src', src);
            });
        }

        //for youtube on the iphone we have to remove playsinline as it's no longer
        //possible to remove the video title information or the "watch later"
        //and "share" buttons (the "showinfo=0" paramater was deprecated in 2018)
        //and the title info completely obscures the native fullscreen and mute buttons
        //which is not cool, making it impossible to enter full-screen or mute the video
        //so for the sake of usability we have to disable playsinline for youtube
        //nb. remove it for all browsers just for markup consistency
        if(/^video\/(x-)?(youtube)$/i.test(player.videoType))
        {
            player.video.removeAttribute('playsinline');
        }

        //remove any loop attribute, because we can't
        //support that with all player modes and functions
        //(although basic native playback would be fine)
        //but infinite looping is not good for accessibility anyway
        player.video.removeAttribute('loop');

        ////get the base volume value parsed from its data-volume attribute if defined
        //player.basevolume = library.getBaseVolume(player.video);

        //reset the native video volume to full, same as we do for the same as flash player
        //because MediaElement has an initial volume setting that only applies to flash
        //and its default is 0.8, so we unify both to 1, then later we'll set them together
        player.video.volume = 1;

        //normalize the video playback rate
        player.video.playbackRate = 1;

        //if the video doesn't have a defined width and height then apply defaults
        //although this isn't strictly necessary for standard HTML video
        //(because the video will use the native dimensions it's encoded at)
        //it is necessary for HLS and DASH since that's not rendered natively
        //(possibly because these aren't available to ME's javascript shim, dk)
        //nb. don't do this for audio-only because it doesn't have those attributes
        //nb. for facebook video we only need the width because the height is ignored
        if(!player.isaudio)
        {
            if(/^(video\/(x-)?)?(facebook)$/i.test(player.videoType))
            {
                if(!player.video.getAttribute('width'))
                {
                    player.video.setAttribute('width', config['default-width']);
                }
            }
            else if(!(player.video.getAttribute('width') && player.video.getAttribute('height')))
            {
                player.video.setAttribute('width', config['default-width']);
                player.video.setAttribute('height', config['default-height']);
            }
        }


        //if the media is audio-only
        if(player.isaudio)
        {
            //look for additional audio elements inside the player container
            //and remove them, since AD is not supported for the audio-only player
            etc.each(etc.get('audio', player.container), function(node)
            {
                if(node !== player.video)
                {
                    etc.remove(node);
                }
            });

            //set the audio data object to null
            player.audiodesk = null;
        }

        //else look for an audio element inside the player container
        //nb. though we're going to remove this and create a new Audio object
        //but what better way to configure the audio than using <audio> markup!
        else if((player.audio = etc.get('audio', player.container)[0] || null))
        {
            //pause the audio if natively supported, which used to be
            //necessary in Firefox 3 in case it had an autoplay attribute
            //else it continued to play even after the element is removed
            //(and in that case its paused flag was also still true!)
            //and although we don't support Firefox 3 anymore
            //we may as well keep condition just to be on the safe side
            if(etc.def(player.audio.pause))
            {
                player.audio.pause();
            }

            //in iOS, trying to play audio descriptions stops the video from playing
            //because it doesn't support multiple media sources playing at the same time
            if(defs.agent.ios)
            {
                player.audiodesk = null;
            }

            //else get the supported audio type for this browser
            //then create an audio data object which lists that type and the src
            ////plus a base volume value parsed from its data-volume attribute if defined
            //as well an enabled flag by whether it has a data-default attribute
            //or keep it null if none of the specified audio sources are supported
            //plus a waiting flag to indicate when the audio is waiting for video loading
            //plus an object of data with xad flags (see xadTracking for details)
            else if(player.audiodesk = library.getSupportedType(player.audio))
            {
                player.audiodesk =
                {
                    type          : player.audiodesk,
                    //basevolume  : library.getBaseVolume(player.audio),
                    enabled       : player.audio.getAttribute('data-default') !== null,
                    waiting       : false,
                    xad           :
                    {
                        activecue : null,
                        lastcue   : null,
                        playing   : false,
                        timer     : null
                    }
                };
                if(!(player.audiodesk.src = player.audio.getAttribute('src')))
                {
                    etc.each(etc.get('source', player.container), function(node)
                    {
                        if(node.getAttribute('type') == player.audiodesk.type)
                        {
                            player.audiodesk.src = node.getAttribute('src');
                            return false;
                        }
                    });
                }
            }

            //else if there is no supported type (because no sources have been defined)
            //then look for alternate links defined in the audio data attributes,
            //qualify them as full URLs relative to the page, then save them to a dictionary
            //nb. if present, the attribute define "data-on" and "data-off" as two separate URLs
            //for different versions of the video (ie. one with built-in AD, and one without)
            //then the AD button itself is used simply as a means of linking between them
            //and we compare the URLs against this page to determine the initial button state
            //ie. if the page matches the "on" URL then we show the button in its "on" state
            //else we show it in its "off" state, which is the default if "on" doesn't match
            else if(player.audio.getAttribute('data-on') && player.audio.getAttribute('data-off'))
            {
                player.audiolinks =
                {
                    on     : etc.qualify(player.audio.getAttribute('data-on')),
                    off    : etc.qualify(player.audio.getAttribute('data-off'))
                };

                //*** DEV TMP
                //console.log('on="'+player.audiolinks.on+'"\noff="'+player.audiolinks.off+'"');
            }

            //now remove the native audio element completely
            //nb. this will stop it from preloading any more data if it had preload auto
            //and will defer all subsequent loading until we've also confirmed that audio can be used,
            //and then until audio is actually enabled, either by default or from its button
            //nnb. this will also effectively negate any autoplay, loop or controls attributes
            player.audio = etc.remove(player.audio);


            //*** DEV TMP
            //console.log(player.audiodesk || 'NULL');
        }

        //else if we have no audio element, set the audio data object to null
        else
        {
            player.audiodesk = null;
        }


        //create a default empty object if the argument is undefined or null,
        //then define a player options dictionary with all its defaults
        //then iterate through the dictionary to validate each callback that's
        //defined in the input options, and either show a console error
        //for any failure, otherwise save the converted value to the dictionary
        options = options || {};
        etc.each((player.options =
        {
            onsuccess : null,
            onfail    : null,
            onerror   : null
        }),
        function(option, key)
        {
            //if this option is defined in the input
            if(etc.def(options[key]))
            {
                //show a console error and break if the callback is not a function
                if(typeof(option = options[key]) != 'function')
                {
                    return etc.console(etc.sprintf(config.lang['option-bad-callback'],
                    {
                        option    : key,
                        id        : player.instance.id,
                        type      : config.lang['define-function']

                    }), 'error');
                }

                //then if we're still here the value was good, so save it to the player dictionary
                player.options[key] = option;
            }
        });

        //now define the additional options defined in container attributes
        //and then iterate through those to look for defined attributes
        //saving the default to the player dictionary first, so we always have it
        //nb. we have to do these separately so we don't look for them in input options
        var attrs =
        {
            'transcript'      : null,
            'responsive'      : null,
            'responsive-mode' : 'initial',
            'controls'        : 'row'
        };
        etc.each(attrs, function(option, key)
        {
            player.options[key] = option;
        });
        etc.each(attrs, function(option, key)
        {
            //if the attribute is defined and not empty
            //taking the opportunity to trim and re-save the string
            if(option = etc.trim(player.container.getAttribute('data-' + key)))
            {
                //switch by option key
                switch(key)
                {
                    //show a console error if the transcript value is not a valid ID
                    //or if the referenced element is already being used by another instance
                    //or if the referenced element is inside the player (or is the player)
                    //** what if you define the transcript inside a different instance player?
                    //** presumably it will overwrite it entirely and break that player with errors
                    //or if the referenced element doesn't have the right class
                    //nb. don't exit for any of these errors, because that can cause later features
                    //to fail unnecessarily, eg. no responsive behaviour if the transcipt is mis-defined
                    //nb. I did consider using "warn" for the missing class, because it's not quite
                    //as serious as other errors, but it is serious enough to warrant the alert
                    case 'transcript' :

                        if((option = etc.get('#' + option)) === null)
                        {
                            etc.console(etc.sprintf(config.lang['option-bad-transcript'],
                            {
                                id : player.instance.id

                            }), 'error');
                        }
                        else if(etc.contains(player.container, option))
                        {
                            etc.console(etc.sprintf(config.lang['option-wrong-transcript'],
                            {
                                id : player.instance.id

                            }), 'error');
                        }
                        else if(!etc.hasClass(option, config.classes['transcript']))
                        {
                            etc.console(etc.sprintf(config.lang['option-class-transcript'],
                            {
                                id   : player.instance.id,
                                name : config.classes['transcript']

                            }), 'error');
                        }
                        else
                        {
                            for(var p in players)
                            {
                                if(players.hasOwnProperty(p))
                                {
                                    if(players[p].transcript && players[p].transcript.id == option.id)
                                    {
                                        etc.console(etc.sprintf(config.lang['option-busy-transcript'],
                                        {
                                            id    : player.instance.id,
                                            other : p

                                        }), 'error');
                                    }
                                }
                            }
                        }
                        break;

                    //show a console error if the responsive value is not a valid ID
                    //or if the referenced element is inside the player (or is the player)
                    //nb. multiple player instances can all use the same responsive element
                    case 'responsive' :

                        if((option = etc.get('#' + option)) === null)
                        {
                            etc.console(etc.sprintf(config.lang['option-bad-responsive'],
                            {
                                id : player.instance.id

                            }), 'error');
                        }
                        else if(etc.contains(player.container, option))
                        {
                            etc.console(etc.sprintf(config.lang['option-wrong-responsive'],
                            {
                                id : player.instance.id

                            }), 'error');
                        }
                        break;

                    //show a console error if the responsive-mode value is not valid
                    case 'responsive-mode' :

                        if(!(option == 'max' || option == 'initial' || option == 'min'))
                        {
                            etc.console(etc.sprintf(config.lang['option-bad-responsive-mode'],
                            {
                                id : player.instance.id

                            }), 'error');
                        }
                        break;

                    //show a console error if the controls value is not valid
                    case 'controls' :

                        if(!(option == 'row' || option == 'stack'))
                        {
                            etc.console(etc.sprintf(config.lang['option-bad-controls'],
                            {
                                id : player.instance.id

                            }), 'error');
                        }
                        break;
                }

                //then if we're still here the value was good, so save it to the player dictionary
                player.options[key] = option;
            }
        });

        //but if this is the audio-only player
        if(player.isaudio)
        {
            //force the controls to be "row" so that auto-hiding doesn't occur
            player.options.controls = 'row';
        }



        //if the options transcript element is not null
        if(player.options.transcript !== null)
        {
            //copy its reference to the player, then enforce relative positioning
            //because auto-scrolling will need that as the context for cue offsets
            (player.transcript = player.options.transcript).style.position = 'relative';

            //also clear any existing content, in case it has a static transcript
            //(or any other content that's only relevant when unsupported)
            player.transcript.innerHTML = '';

            //then define atomic aria-live=off so that dynamic changes
            //are recognised by screenreaders but not announced
            //also set tabindex on the transcript so that keyboard users can scroll it with the arrow keys
            //(which firefox does natively, but for other browsers we have to do it explicitly)
            //nb. using the DOM property name so we don't need to think about browser differences
            etc.render(player.transcript,
            {
                'aria-live'        : 'off',
                'aria-atomic'      : 'true',
                'aria-relevant'    : 'all',
                '.tabIndex'        : '0'
            });


            //if the transcript container's parent is the expander
            if(player.transcript.parentNode.className == config.classes['expander'])
            {
                //add the details polyfill for expand/collapse behaviour
                //nb. we defined an html5 shim for it in mediaelement.min.js
                addTranscriptExpander(player, player.transcript.parentNode);
            }

            //else if the transcript container's parent is a details element
            //but doesn't have the expander class, then show a console warning
            else if
            (
                player.transcript.parentNode.nodeName.toLowerCase() == 'details'
                &&
                !etc.hasClass(player.transcript.parentNode, config.classes['expander'])
            )
            {
                etc.console(etc.sprintf(config.lang['option-class-expander'],
                {
                    id : player.instance.id

                }), 'warn');
            }
        }

        //then convert the option value to a boolean either way
        player.options.transcript = etc.def(player.transcript);


        //if the options responsive container is not null
        if(player.options.responsive !== null)
        {
            //copy its reference to the player
            player.responsive = player.options.responsive;

            //add the responsive class to the player container
            etc.addClass(player.container, config.classes['responsive']);
        }

        //then convert the option value to a boolean either way
        player.options.responsive = etc.def(player.responsive);


        //if the media is video, add the skip links
        //nb. we can't do this until we've parsed the options
        //because the function needs to know whether there's a transcript
        if(!player.isaudio)
        {
            addSkipLinks(player);
        }

        //### PHP ###// <?php if(isset($_GET['fork']) && $_GET['fork'] == 'free'): ?>

        //if the media is video and logo-bug href is not empty, add the logo-bug link
        //but don't add it for ios because it obscures third-party or native interfaces
        //(so it would be fine for ipad with custom controls, but it's simpler just to say no)
        //nb. we can't do this until we've begun to test for image support
        //because older versions of IE will need to know if they're enabled
        if
        (
            !player.isaudio
            &&
            !defs.agent.ios
            &&
            config['logo-bug-href']
        )
        {
            addLogoBug(player);
        }

        //### PHP ###// <?php endif; ?>


        //define a path to the flash shims and renderers relative to this script
        //nb. get the path relative to mediaelement.js because that's what
        //ME2 did automatically to get its own path to the original shim
        //so if it worked (or didn't work lol) for that then this will be the same
        //and also because that script is in the head so we'll find it sooner
        //nnb. it can only fail if mediaelement isn't loaded by <script src>
        //or if there's another instance or script with the same name that
        //occurs before our instance script and is in a different folder
        //the chances of the latter are, well, tealeaf and east india company
        //although the former is more plausible, but that's just how it is
        //the script has to be loaded via <script src> or we can't get a path
        var pluginPath = null;
        etc.each('script', function(s)
        {
            if(s.src.indexOf('mediaelement.') >= 0)
            {
                pluginPath = s.src.substring(0, s.src.lastIndexOf('/') + 1);
            }
        });

        //if that does fail, throw the path failure error and exit
        if(!pluginPath)
        {
            return etc.console(etc.sprintf(config.lang['path-failure']), 'error');
        }


        //now pass the video to MediaElement, which handles external APIs like youtube
        //to provide compatible events and methods, creates a flash or JS shim for
        //unsupported native formats, and rounds off some browser quirks with native
        new MediaElement(player.video,
        {
            //element name for the MediaElement replacement container
            //so it doesn't use an invalid custom <mediaelementwrapper>
            fakeNodeName : 'div',

            //plugin path for flash shims and renderers
            pluginPath : pluginPath,

            //define some parameter overrides for youtube videos in iOS
            //enabling native controls so you can resume playback after pausing
            //(because the big play button is gone when you play then exit fullscreen)
            //also disable playsinline, although this doesn't actually seem to make
            //any difference, it's consistent with removing the playsinline attribute
            //which we have to remove for youtube for the sake of usability
            //then for everyone, set cc_load_policy to show any embedded captions
            //which we can then hide again if necessary using unloadModule
            youtube : (function()
            {
                if(defs.agent.iphone)
                {
                    return { controls : 1, playsinline : 0, cc_load_policy : 1 };
                }
                return { cc_load_policy : 1 };
            })(),

            //if the media fails to initialise
            //nb. this only happens if it fails to load a required renderer
            //but we don't need to do anything here because we already handle
            //that by returning an error state from addMediaInterface
            error : function(media)
            {
            },

            //when MediaElement successfully initialises
            //nb. this is when the library successfully intialises, not the media,
            //it still gets called if the media itself could not be loaded
            success : function(media)
            {

                //save the media object to a player property
                player.media = media;

                //*** DEV TMP
                //console.warn('player.media.rendererName');
                //console.log(player.media.rendererName);

                //update the instance mode and renderer flags according to rendererName
                //nb. mode will be "native" if native video is supported
                //otherwise it will reflect the active shim, eg. "flash" or "youtube"
                //nb. if there are no media sources then rendererName will be null
                //and in that case we want the keep the mode flag at its "fallback" default
                if(player.media.rendererName)
                {
                    player.instance.mode =
                        player.media.rendererName.indexOf('flash') >= 0 ? 'flash' :
                        player.media.rendererName.indexOf('youtube') >= 0 ? 'youtube' :
                        player.media.rendererName.indexOf('facebook') >= 0 ? 'facebook' :
                        player.media.rendererName.indexOf('vimeo') >= 0 ? 'vimeo' :
                        'native';

                    player.instance.renderer = player.media.rendererName;
                }

                //then we must copy the instance mode to a player flag, because the
                //instance is public data, and we can't risk the problems that would
                //arise if authors change it, so for internal use we only refer
                //to the player mode flag, while the instance data is purely for
                //the author's reference and makes no practical difference to anything
                //so do that, and then if the mode is flash set the videoType manually
                //because getSupportedType returns null under those circumstances
                //nb. technically it's not really using these types, but they reflect the source
                //and we can't leave the value as null or we'll trigger fallback content
                if((player.mode = player.instance.mode) == 'flash')
                {
                    player.videoType = player.instance.videoType =
                        player.isaudio ? 'audio/mp3' :
                        player.media.rendererName == 'flash_hls' ? 'application/x-mpegURL' :
                        player.media.rendererName == 'flash_dash' ? 'application/dash+xml' :
                        'video/mp4';
                }

                //*** DEV TMP
                //console.warn('player.mode');
                //console.log(player.mode);

                //*** DEV TMP
                //console.warn('player.videoType');
                //console.log(player.videoType);

                //if videoType is null then there are no video sources
                //so call abandonMedia to show the fallback content, and we're done
                if(player.videoType === null)
                {
                    return abandonMedia(player);
                }

                //[else] update the instance src with the media src
                //removing the parameters query string if this is vimeo
                //nb. we can't use media.getSrc() because that will return
                //a blob URL for HLS or DASH; but by this point ME has set
                //an src on the source video so we can just reference that
                player.instance.src = player.video.src;
                if(player.mode == 'vimeo')
                {
                    player.instance.src = player.instance.src.split('?')[0];
                }


                //if the config user-persistence key is not empty
                //trim and URI-encode it and save to the basekey property
                //otherwise set basekey to null for easy comparison
                //nb. encode in case of characters that can't be used in cookie keys
                if(!etc.empty(config['user-persistence'], true))
                {
                    player.basekey = encodeURIComponent(etc.trim(config['user-persistence']));
                }
                else
                {
                    player.basekey = null;
                }

                //also trim and encode the individual value keys
                etc.each(['user-volume','user-pin'], function(key)
                {
                    config[key] = encodeURIComponent(etc.trim(config[key]));
                });

                //now look for a user volume value, saved with a combination of
                //the base key and the individual value key, and if we have one
                //then save it to the default volume so it gets set by default
                //first parsing it as a float because storage values are strings
                //nb. only user volume changes are saved, not changes to the muted state
                //(on the assumption that muting is something you only do temporarily)
                //nor programatic changes like setting the initial default
                config['default-volume'] = parseFloat
                (
                    library.getStorageValue(player.basekey, config['user-volume'])
                    ||
                    config['default-volume']
                );


                //then if we have audio config
                if(player.audiodesk !== null)
                {
                    //update the instance audioType (from its default of "none")
                    player.instance.audioType = player.audiodesk.type;

                    //then if the audio is enabled by default, instantiate the audio
                    //which creates a new Audio source with the supported src
                    //normalizes the volume and playback rate, and then applies
                    //the same preload setting as was specified for the video
                    //nb. always use "none" for the flash player for
                    //because ME doesn't seem to support "auto" anymore
                    if(player.audiodesk.enabled)
                    {
                        audioConstruct(player, player.mode == 'flash' ? 'none' : player.video.getAttribute('preload'));
                    }
                }


                //*** DEV TMP
                //console.log(player.audiodesk ? etc.dump(player.audiodesk) : 'NULL');

                //and now we can set the default video and audio volume
                //nb. this usually fails in the youtube player, so we have to
                //do it again when the video plays, at which point it's fine
                setMediaVolume(player, config['default-volume']);


                //define the other player flags we're going to need:
                //=> the "fakevolume" flag indicates that we're changing the volume
                //   which we use to ignore media volumechange events that we triggered
                //   then we can respond to changes from native controls without infinite recursion
                //=> the "started" flag indicates whether the video has been played for the first time
                //   which we need (among other things) to identify the first play event, because
                //   evaluating duration and currentTime alone is not reliable, since it's
                //   possible to play and then pause again before even the metadata has loaded
                //=> the "ended" flag which is a manually maintained version of the video ended flag
                //   so we can detect when it was caused to end by things like manual seeking
                //=> the "fullscreen" flag indicates whether we're in full-screen mode
                //   and will always be false, unless we detect a supported fullscreen model
                //   in which case it will be updated by the corresponding screenchange event
                player.fakevolume = false;
                player.started = false;
                player.ended = false;
                player.fullscreen = false;

                //when loading third-party content, the ME success callback
                //fires before the content iframe has even been created, which
                //is fucking stupid if you ask me, but regardless, for YouTube
                //or Facebook we need those references, so we have to wait for
                //the API to exist before we can initialise the media interface
                //so, abstract the interface creation and return handling
                function initMediaInterface()
                {
                    //add the player interface and additional media events
                    //and if that returns true then everything was successful
                    if(addMediaInterface(player))
                    {
                        //if this is the audio-only player, hotswap the instance types
                        //so that the data they return corresponds with the actual media
                        //nb. we continue to use player.videoType internally
                        if(player.isaudio)
                        {
                            player.instance.audioType = player.instance.videoType;
                            player.instance.videoType = 'none';
                        }

                        //if we have an onsuccess callback, call it now in the instance scope
                        if(player.options.onsuccess)
                        {
                            player.options.onsuccess.call(player.instance);
                        }
                    }

                    //but if it returns false then the media couldn't initialize
                    else
                    {
                        //reset the instance types to none
                        player.instance.videoType = 'none';
                        player.instance.audioType = 'none';

                        //set the mode to "fallback"
                        player.instance.mode = 'fallback';

                        //call abandonMedia to display the fallback content
                        //which will also call the instance onfail callback if there is one
                        abandonMedia(player);
                    }
                }

                //then if this is third-party media
                if(library.isThirdPartyMedia(player.mode))
                {
                    //define a dictionary of API references indexed by mode
                    var apis =
                    {
                        youtube     : 'youTubeApi',
                        facebook    : 'fbPlayer',
                        vimeo       : 'vimeoPlayer'
                    };

                    //then poll for the existence of that object
                    //and initialise the media when it exists
                    var initwait = __.setInterval(function()
                    {
                        if(etc.def(player.media[apis[player.mode]]))
                        {
                            __.clearInterval(initwait);
                            initMediaInterface();
                        }
                    }, 250);
                }

                //else initialise the media interface straight away
                else
                {
                    initMediaInterface();
                }

            }
        });
    };

    //audio constructor
    //nb. this is purely an alias to $this.Video and can initialise either media
    $this.Audio = function(id, options, container)
    {
        //if the supported flag is false, just silently exit
        if(!$this.supported) { return; }

        //[else] check that this function is being called as a constructor
        //otherwise the instance reference may not point to the correct instance
        //and if not, show a console error and return false for failure
        if(this.constructor !== $this.Audio)
        {
            return etc.console(config.lang['constructor-not-new-audio'], 'error');
        }

        //[else] instantiate a new Video object using the input arguments
        return new $this.Video(id, options, container);
    };







    //-- public => static utility methods --//

    //modify config properties, using a dot in the key to indicate sub-groups
    //ie. "foo" for a top-level option or "group.foo" for a sub-group option
    //and you can also put "config.foo" to refer to a top-level option
    //nb. we validate and return false if the specified group or option
    //doesn't exist, or if the specified value is the wrong data type
    $this.define = function(keys, value)
    {
        //if the supported flag is false, just silently exit
        if(!$this.supported) { return; }

        //[else] if one or more player instances already exist
        //show a console warning and return false for failure
        if(!etc.empty(players))
        {
            return etc.console(config.lang['define-too-late'], 'warn');
        }

        //[else] if the key is "logo-bug-href" or "logo-bug-data" then don't allow
        //it to be redefined, so that the free version can't change them this way,
        //and the paid version doesn't report an error for the now undefined key;
        //or if the key is anything deprecated, just ignore it to avoid warnings
        if
        (
            keys == 'logo-bug-href'
            ||
            keys == 'logo-bug-data'
            ||
            keys == 'buffer-size'
            ||
            keys == 'buffer-limit'
            ||
            keys == 'allow-autoplay'
            ||
            keys == 'lang.keyboard-help-text'
            ||
            keys == 'lang.skip-link-shortcuts'
            ||
            keys == 'lang.controls-legend'
        )
        {
            return;
        }

        //[else] trimsplit the key by "." to get an array of 1 or 2 value, then create
        //the keys dictionary accordingly, using null for the group if we don't have one
        keys =
        {
            group    : ((keys = etc.trim(keys).split(/\s*\.\s*/)).length == 1 ? null : keys[0]),
            option    : keys[keys.length - 1]
        };

        //if the group is defined then check that it exists and is a group
        //else show a console error and return false for failure
        if(keys.group !== null)
        {
            if(typeof(keys.obj = config[keys.group]) !== 'object' || (keys.obj instanceof Array))
            {
                return etc.console(etc.sprintf(config.lang['define-bad-group'],
                {
                    group : keys.group

                }), 'error');
            }
        }

        //then check that the specified option exists and isn't an option group
        //else show a console error for that and return false for failure
        if
        (
            !etc.def(keys.obj = (keys.group !== null ? config[keys.group][keys.option] : config[keys.option]))
            ||
            (typeof(keys.obj) === 'object' && !(keys.obj instanceof Array))
        )
        {
            return etc.console(etc.sprintf(config.lang['define-bad-option'],
            {
                option : (keys.group !== null ? (keys.group + '.') : '') + keys.option

            }), 'error');
        }

        //then check that the specified value has the correct data type
        //taking the opportunity to trim and re-save the value if it's a string
        //else show a console error for that and return false for failure
        if(typeof(value = etc.trim(value)) !== (keys.type = typeof(keys.group !== null ? (keys.current = config[keys.group][keys.option]) : (keys.current = config[keys.option]))))
        {
            return etc.console(etc.sprintf(config.lang['define-bad-type'],
            {
                option : (keys.group !== null ? (keys.group + '.') : '') + keys.option,
                type   : config.lang['define-' + ((keys.current instanceof Array) ? 'array' : keys.type)]

            }), 'error');
        }


        //now do any silent normalization or correction
        //to prevent invalid definitions that could give rise to errors
        //but which aren't worth the overhead of individual error messages
        switch(keys.option)
        {
            //=> media-default-volume must be gte 0 and lte 1
            case 'default-volume'    :
                value = value < 0 ? 0 : value > 1 ? 1 : value;
                break;
        }


        //then save the value to the specified [group.]option
        if(keys.group !== null)
        {
            config[keys.group][keys.option] = value;

            //*** DEV TMP
            //etc.console('config["'+keys.group+'"]["'+keys.option+'"] ('+keys.type+') = ' + config[keys.group][keys.option]);
        }
        else
        {
            config[keys.option] = value;

            //*** DEV TMP
            //etc.console('config["'+keys.option+'"] = ('+keys.type+') ' + config[keys.option]);
        }


        //return true for success
        return true;
    };


    //batch initialise all player instances on the page, identified by container class
    //nb. this is a shortcut to save having to define multiple Video constructors
    //or for cases where it's difficult or inconvenient to know the instance ID(s)
    $this.init = function()
    {
        //create an empty batch instances array
        var batch = [];

        //if the browser supports getElementsByClassName then use that to create
        //an array of all the player instances, identified by their container class
        if(etc.def(_.getElementsByClassName))
        {
            batch = etc.list(_.getElementsByClassName(config.classes['container']));
        }

        //otherwise we'll have to build it manually from a star collection
        //which has to allow for any type of element in case they're not DIVs
        else
        {
            etc.each('*', function(item)
            {
                if(etc.hasClass(item, config.classes['container']))
                {
                    batch.push(item);
                }
            });
        }

        //iterate through the collection and identify any with missing or duplicate IDs
        //then remove those members from the array and show a console warning for them
        //nb. remember to compensate for splicing by decrementing the iterative counter
        etc.each(batch, function(item, n)
        {
            if(!item.id)
            {
                etc.console(config.lang['batch-no-id'], 'warn');

                batch.splice(n, 1);
                return -1;
            }
            else
            {
                //nb. this single use-case doesn't warrant including etc.find
                //** or are there other places where you've made the same decision?
                //** which now means there's more than one instance of needing it
                var unique = true;
                etc.each(n, function(x)
                {
                    if(item.id == batch[x].id)
                    {
                        return unique = false;
                    }
                });
                if(!unique)
                {
                    etc.console(config.lang['batch-bad-id'], 'warn');

                    batch.splice(n, 1);
                    return -1;
                }
            }
        });

        //if the batch array is empty then we found no [valid] player instances
        //so show a console warning and then return false for failure
        //nb. this shouldn't be an error because it might deliberate eg. if you have the
        //init command on every page for convenience to catch any pages with players
        if(!batch.length)
        {
            return etc.console(config.lang['batch-no-found'], 'warn');
        }

        //*** DEV TMP
        //var ids = [];
        //etc.each(batch, function(item)
        //{
        //    ids.push(item.id);
        //});
        //alert('"#'+ids.join('"\n"#')+'"');

        //[else if we're good] it simply remains to iterate through the batch
        //and pass each player container ID to the new Video constructor
        //nb. we can't pass any options since this is a simple batch initialisation
        //if an instance requires additional options then it should use the constructor
        etc.each(batch, function(item)
        {
            new $this.Video(item.id);
        });

        //then return true for success
        return true;
    };


    //add global callbacks for playback events, eg. "play", "pause" etc.
    //nb. callbacks will fire for all player instances and cannot be defined
    //on a per-instance basis, because we need to be able support this
    //after OzPlayer.init and there isn't really any point supporting both
    //but authors can still filter by instance using event.id in the callback
    $this.addListener = function(a, b)
    {
        //if neither arguments are functions, or the first is a string
        //but the second isn't a function, show a console warning
        //with the no-fn error and return false for failure
        if
        (
            (typeof(a) != 'function' && typeof(b) != 'function')
            ||
            (typeof(a) == 'string' && typeof(b) != 'function')
        )
        {
            return etc.console(config.lang['event-no-fn'], 'warn');
        }

        //[else] if the first argument is not a string or function
        //show a console warning for bad-args and return false for failure
        if(typeof(a) != 'string' && typeof(a) != 'function')
        {
            return etc.console(config.lang['event-bad-args'], 'warn');
        }

        //[else] if the first argument is a string
        if(typeof(a) == 'string')
        {
            //if it doesn't represent a valid event type, show a
            //console warning for bad-type and return false for failure
            if(etc.find(defs.events, a) < 0)
            {
                return etc.console(etc.sprintf(config.lang['event-bad-type'], { type : a }), 'warn');
            }

            //[else] add the callback to the dictionary indexed by event type
            events[a].push(b);
        }

        //else [if the first argument is a function]
        else
        {
            //add the callback to the dictionary for every event type
            etc.each(defs.events, function(e)
            {
                events[e].push(a);
            });
        }

        //*** DEV TMP
        //console.warn('addListener');
        //console.dir(events);
    };







    //-- private => event functions --//

    //compile callback event data and call the specified callbacks(s)
    function doEventCallback(player, type)
    {
        //iterate through the callbacks defined for this event
        etc.each(events[type], function(fn)
        {
            //compile the event data with the event type, the page referer
            //(remembering to use the forever-necessary spelling error lol)
            //and the user-agent, along with a copy of the instance media data
            //nb. we need a copy of the instance data not a reference so that
            //any modifications in the callback don't affect the source data
            var e =
            {
                type    : type,
                referer : _.location.href,
                ua      : navigator.userAgent,
                media   : etc.copy(player.instance)
            };

            //add the media current time and duration floored to the nearest second
            //nb. using floor in case floating point discrepancies are either side of 0.5
            e.media.currentTime = Math.floor(player.media.currentTime);
            e.media.duration = Math.floor(player.media.duration);

            //normalize currentTime to duration if its zero on the ended event
            //nb. this unifies flash with native, where the flash player
            //automatically resets back to the start when the video ends
            if(e.type == 'ended' && e.media.currentTime == 0)
            {
                e.media.currentTime = e.media.duration;
            }

            //normalize duration to NaN if it's 0 on the play event
            //nb. this unifies flash with native, where native has NaN
            //for duration when first playing the video, while flash has 0
            if(e.type == 'play' && e.media.duration == 0)
            {
                e.media.duration = NaN;
            }

            //call the callback
            //nb. no defined scope will mean that this == window
            fn(e);
        });
    }







    //-- private => media functions --//

    //abandon the media in responses to a terminal init failure
    //nb. this is called if the media element can't be initialized
    //eg. for no supported mime-type, or plugins are disabled
    function abandonMedia(player)
    {
        //replace the video with the fallback content
        //(instead of creating an error message)
        library.getVideoFallback(player.media);

        //reset the instance types to "none"
        player.instance.videoType = 'none';
        player.instance.audioType = 'none';

        //remove the skip links if present, because there's no longer
        //any significant content to skip past, and they seem incongruous
        if(player.skiplinks)
        {
            player.skiplinks = etc.remove(player.skiplinks);
        }

        //remove the logo bug if it's present, in order to avoid the
        //player's branding being diluted by lack of browser support
        if(player.logo)
        {
            player.logo = etc.remove(player.logo);
        }

        //then if we have an onfail callback, call it now in the scope
        //of the player instance (so the callback can refer to it as "this")
        if(player.options.onfail)
        {
            player.options.onfail.call(player.instance);
        }
    }

    //play the video and audio if applicable
    //nb. we don't play audio in regular sync with video if we have xad data
    //because xad cues are handled differently (see xadTracking for details)
    function playMedia(player)
    {
        player.media.play();
        if(player.audio)
        {
            if(!player.tracks.xad)
            {
                player.audio.play();
            }
        }
    }

    //pause the video and audio as applicable
    //=> pause video if the dopause flag is strictly true
    //=> pause audio if it's present and we're not using xad
    //nb. we don't play audio in regular sync with video if we have xad data
    //because xad cues are handled differently (see xadTracking for details)
    function pauseMedia(player, dopause)
    {
        if(dopause === true)
        {
            player.media.pause();
        }

        if(player.audio)
        {
            if(!player.tracks.xad)
            {
                player.audio.pause();
            }
        }
    }

    //set the media to a specific time using the applicable method
    //nb. the input time is a float or integer between 0 and (duration)
    //nb. the unified media object has a setCurrentTime function
    //but for native controllers and audio we use the currentTime property
    //but we must check that the audio has reached a suitable readyState
    //in case it's slower to load than the video, or the user has no sound output
    function setMediaTime(player, time)
    {
        //limit the time to zero at one side and (duration) at the other
        //or if the duration is NaN or zero then also limit it to zero
        if(isNaN(player.media.duration) || player.media.duration == 0 || time < 0)
        {
            time = 0;
        }
        else if(time > player.media.duration)
        {
            time = player.media.duration;
        }

        //then set the currentTime on the media and audio if applicable
        //nb. check the audio readyState in case it's not ready yet
        //since setting currentTime would otherwise throw an error
        //nb. we don't play audio in regular sync with video if we have xad data
        //because xad cues are handled differently (see xadTracking for details)
        player.media.setCurrentTime(time);
        if(player.audio && player.audio.readyState >= 2)
        {
            if(!player.tracks.xad)
            {
                player.audio.currentTime = time;
            }
        }

        //if we have enabled audio descriptions, synchronise the audio with the video
        if(player.audio && player.audiodesk.enabled)
        {
            audioSynchronise(player);
        }
    }

    //set the media to a specific volume using the applicable method
    //nb. the input volume is a float between 0 and 1 (where 1 is full volume)
    //nb. the unified media object has a setVolume function
    //but for native audio we just use the volume property
    //nb. this doesn't work in iOS and Android, which must be deliberate
    //so that individual media objects can't be different from the system volume
    //(in fact its native video controls don't even have a volume control)
    //although Android will still return the value we set if we query video.volume
    //while in iOS it will always return 1, but the volume won't change in either case
    //nb. the input muted flag is a boolean, so we can mute the video and audio
    //and if the volume argument is null that can happen without changing the volume
    function setMediaVolume(player, volume, muted)
    {
        //*** DEV TMP
        //if(__.console) { console.log('%c'+'setMediaVolume()\n\tvolume => ' + volume + '\n\t muted => ' + muted + '\nvideo basevolume = ' + player.basevolume + '\naudio basevolume = ' + (player.audiodesk ? player.audiodesk.basevolume : '-'), 'color: #00c; background: #9ff;'); }

        //nb. we get an actionscript source error from the MediaElement
        //youtube player if this is called before the canplay event
        //we already handle that event to re-apply the default volume
        //so we just need to wrap all this in a silent exception handler
        try
        {
            //set the fake volume flag, so we know to ignore the reciprocal
            //volumechange event, that would otherwise trigger this again
            //and then fire another event, and so on for infinite recursion
            player.fakevolume = true;

            //if the input volume is defined and not null
            if(etc.def(volume, null))
            {
                //limit the volume its valid extremes in case of an invalid default
                //(because it would throw an error if we set it outside the range)
                volume = volume > 1 ? 1 : volume < 0 ? 0 : volume;

                //then set the volume on the media and audio if applicable
                player.media.setVolume(volume);
                if(player.audio)
                {
                    player.audio.volume = volume;
                }

                //*** DEV TMP
                //if(__.console) { console.log('%c' + 'video final volume = ' + player.media.volume + '\nfinal audio volume = ' + (player.audiodesk ? player.audio.volume : '-'), 'color: #000; background: #9f9;'); }

                //*** DEV TMP (test audio synchronisation while only listening to audio)
                //player.video.volume = 0;
                //if(player.audio)
                //{
                //    player.audio.volume = 1;
                //}
            }

            //if the muted flag is defined and not null
            if(etc.def(muted))
            {
                //set the muted state on the media
                player.media.setMuted(muted);

                //but if we have audio and the audio is not enabled or it's waiting for
                //video to load, then keep its muted flag true, because muted is used to
                //switch it off when the user disables audio descriptions or when waiting
                //nb. but we still allow audio volume changes in the meantime
                //so that if they're enabled again they'll already have a matching volume
                if(player.audio)
                {
                    player.audio.muted = player.audiodesk.enabled && !player.audiodesk.waiting ? muted : true;
                }
            }

            //pause a fraction just to be on the safe side,
            //then reset the fakevolume flag back to false
            //nb. we pause in case this happens before the volumechange event has
            //fired, because these events have high latency, particularly in IE9
            etc.delay(100, function(){ player.fakevolume = false; });
        }
        catch(ex){}
    }


    //compile an array with the buffer timeranges data for a media object
    function getBufferData(media)
    {
        //create a buffer array
        var buffer = [];

        //iterate through the number of timeranges in the buffered object
        etc.each(media.buffered.length, function(i)
        {
            //get the start and end point of this time range rounded to 2 decimal places
            //nb. we don't need greater precision, and this makes the numbers easier to log
            var range = [
                Math.round(media.buffered.start(i) * 100) / 100,
                Math.round(media.buffered.end(i) * 100) / 100
                ];

            //nb. in firefox < 35 we may get time ranges with negative values
            //see: https://bugzilla.mozilla.org/show_bug.cgi?id=1105984
            //but we can fix that by checking whether the first one is negative
            //and compensating all subsequent time ranges by that difference
            //nb. if you seek past the end of the first range, it doesn't
            //create another one, it just stops firing progress events
            //even though the media does keep loading and playing data
            //so we have to deal with that separately in the progress events
            if(media.buffered.start(0) < 0)
            {
                range[0] = Math.round((range[0] - media.buffered.start(0)) * 100) / 100;
                range[1] = Math.round((range[1] - media.buffered.start(0)) * 100) / 100;
            }

            //now add this time range to the buffer array
            buffer.push(range);
        });

        //nb. in firefox ±19 the final range value may exceed the video duration
        //if you seek past the current range so start a new one near the end of the video
        //(eg. producing range data like [[0,48.35], [160.33,3202.65]] for a duration of 202.65)
        //which would be rendered in the buffer info causing it to break outside its layout
        //but we can easily compensate for that by limiting the end range value
        //nb. also in firefox 10-14(-18?) the first value in range[0] may be a huge number
        //like [18446744073.71,0.41] but we can compensate for that by always setting it zero
        //since the first value in range[0] always represents the start of the video
        //(unless we supported streaming, in which case it could be higher; but we don't)
        //nnb. double-check that we have a duration in case this is called when we don't
        //and then check that the buffer contains any ranges in case it's still empty
        if
        (
            !isNaN(media.duration)
            &&
            buffer.length > 0
        )
        {
            if(buffer[buffer.length - 1][1] > media.duration)
            {
                buffer[buffer.length - 1][1] = media.duration;
            }
            buffer[0][0] = 0;
        }

        //return the populated (or possibly still empty) buffer array
        return buffer;
    }


    //compare the current time of a media object with the data in its buffer
    //to determine whether that time point is inside a buffered timerange
    //or whether any other conditions apply that indicate the media is loading
    //nb. this is called from loading related events to work out when to show the
    //loading dialog, for implementations that don't fire enough waiting/canplay events
    //eg. the flash player only fires one at the start, whereas the native player
    //in recent browsers fires another one after each seek-triggered load
    function isTimeBuffered(media)
    {
        //get the buffer data and current time
        var
        buffer = getBufferData(media),
        time = media.currentTime;

        //before first playback, the flash player produces a single time range at [0,0]
        //(where native produces an empty buffer) so in that case we can just return false
        if(time == 0 && buffer.length == 1 && buffer[0][0] == 0 && buffer[0][1] == 0)
        {
            return false;
        }

        //if we have a single range with less than 2s, return false
        //nb. this caters for IE11's initial 1-2s of buffer time at the start
        //which would mean the loading indicator wouldn't show even though
        //it hasn't actually loaded enough for uninterrupted initial playback
        //which in turns affects the synchronisation of audio descriptions
        if(time < 2 && buffer.length == 1 && buffer[0][1] < 2)
        {
            return false;
        }

        //if the time is greater than zero and the same as the previous event, return false
        //nb. this caters for low bandwidth situations where the video is frozen
        //due to loading even though the time is inside a loaded range
        //which is a particular problem with AD since the AD would continue
        //to play as normal, but also generally useful for better load indication
        //nb. we don't do this if the time is zero because in chrome we had a
        //situation where the first progress event would have fired before this
        //with the initial first few seconds, then subsequent monitoring events
        //could fire again before another progress or timeupdate event has fired
        //resulting in a second event with a zero time that triggered the loading
        //indicator, even though we didn't actually need it to display at that point
        //nb. we also don't do this if the media playback rate is zero, which caters
        //for IE11 when playing an xad audio cue, because it continues to fire
        //timeupdate events even when the rate is zero (see xadTracking for details)
        if(media.previousTime === time && time > 0 && Math.round(media.playbackRate) == 1)
        {
            return false;
        }
        media.previousTime = time;

        //[else] iterate through the buffer ranges
        //nb. use a normal iterator so we can return from it
        for(var len = buffer.length, i = 0; i < len; i ++)
        {
            //if the time is inside this range, return true
            if(time >= buffer[i][0] && time <= buffer[i][1])
            {
                return true;
            }
        }

        //if we get here then we didn't match a range, so return false
        //nb. we'll also get to this point if the buffer is empty
        return false;
    }


    //abort media playback and progress monitoring and show the timeout indicator
    function abortMedia(player, dopause)
    {
        //silence all the progress events
        //** this doesn't stop progress events in flash from load failure
        //** and doens't stop timeupdate events in flash from manual abort
        etc.each(player.progressevents, function(handler)
        {
            handler.silence();
        });

        //if we have audio, reset its SRC so it doesn't keep loading in the background
        //nb. originally I tried setting the src to null, but that didn't stop it in Chrome
        //then I tried setting an empty string, and that worked, but generates a server request
        //so then I thought of this trick, of setting an empty data URI with a fake audio mime-type
        //which works perfectly, effectively loading a new resource that the browser doesn't support
        //in fact we do get a loadstart event for it, and then an error event when it fails
        //so we should also remove its handlers so they don't respond to this, since they're
        //only used to indicate the status of the audio, but first double-check that they
        //have already been added and not already cancelled (though I can't think how that
        //could happen, but it did appear to happen once in IE9, then I couldn't replicate it!)
        if(player.audio)
        {
            if(player.audiodesk.onerror)
            {
                player.audiodesk.onerror.silence();
                player.audiodesk.onerror = null;
            }
            if(player.audiodesk.onprogress)
            {
                player.audiodesk.onprogress.silence();
                player.audiodesk.onprogress = null;
            }
            player.audio.src = 'data:audio/x-stop;';
        }

        //hide the loading indicator
        hideIndicator(player);

        //if the poster is still present, remove that too
        //nb. which we also have to do in case this is triggered
        //from an "error" event when preload was set to "auto"
        if(player.poster)
        {
            player.poster = etc.remove(player.poster);
        }

        //also remove any video poster attribute, likewise
        player.video.removeAttribute('poster');

        //pause the media, passing on the video dopause flag
        //nb. when we call this from xphonehome we have to explicitly pause
        //so that the video doesn't continue to play when validation fails
        //but when we call this from load failure we don't need to pause
        //since the video has failed to load and therefore isn't playing
        //however the actual reason for not doing it is that in the Flash player
        //(in older Firefox at least) calling media.pause() after load failure
        //creates massive lag that freezes the whole browser for several seconds
        pauseMedia(player, dopause);

        //then update the playpause button state to off
        updateControlState(player, 'playpause', 'off');

        //likewise the cc and ad buttons, as defined
        //including closing any menus that are defined for them if CSS is enabled
        //nb. otherwise the buttons may still show their loading message
        //if preload is auto and this happens while they're loading
        etc.each(['cc','ad'], function(key)
        {
            if(player.controlform[key])
            {
                updateControlState(player, key, 'off');
            }
            if(player.controlform['menu-' + key] && haveCSS(player.controlform['menu-' + key]))
            {
                player.controlform['menu-' + key].setAttribute('aria-hidden', 'true');
            }
        });

        //disable all the buttons except the fullscreen button
        //(just in case you're already in fullscreen when this happens)
        //nb. there are cases where the mute button is already disabled
        //but it doesn't do any harm and doesn't need to be excepted
        etc.each(player.buttonkeys, function(row)
        {
            etc.each(row, function(key)
            {
                if(key != 'fullscreen')
                {
                    updateControlDisabled(player, key, true);
                }
            });
        });

        //remove any active tooltip and nullify the tooltipbutton flag
        maybeRemoveButtonTooltip(player.controlform);

        //hide all the slider tooltips, which we have to do
        //before disabling them else the command will be ignored
        etc.each(sliders, function(tipslider)
        {
            maybeHideSliderTooltip(tipslider);
        });

        //disable both the sliders and their underlying control
        //nb. although the seek slider will already be disabled
        //at the start, it's good to be thorough in case we ever
        //have a situation where we need to do this during playback
        etc.each(['seek','volume'], function(key)
        {
            if(player.controlform[key])
            {
                (key = player.controlform[key]).disabled = true;
                (key = sliders[key.id]).thumb.disabled = true;
                key.thumb.setAttribute('aria-disabled', 'true');
                etc.addClass(key.container, config.classes['state-disabled']);
            }
        });

        //finally show the timeout indicator, which overlays the
        //screen like the loading indicator, but with a big "X" icon
        showIndicator(player, 'timeout');

        //then if we have an onerror callback, call it now in the scope
        //of the player instance (so the callback can refer to it as "this")
        //nb. don't hot-swap audioType and videoType because that already happens
        //when onsuccess is called, and that always happens before onerror
        //(because it refers to initialisation, not media loading success)
        if(player.options.onerror)
        {
            player.options.onerror.call(player.instance);
        }
    }


    //create a new audio element from the pre-defined audio config, the existence
    //of which confirms we've established that the audio source is supported and usable
    //and which will happen by default when initialising the player if the audio
    //has the data-default attribute, else it will happen the first time it's enabled
    function audioConstruct(player, preload)
    {
        //create a new Audio object and save it to the player reference
        player.audio = new Audio();

        //specify the preload setting defined in the preload attribute
        //which will be the same as the video's preload if descriptions
        //are enabled by default, or it's "auto" if they're only enabled
        //later, which is necessary for chrome so the audio starts preloading
        //as soon as it's enabled, and therefore starts to play as soon as it can
        player.audio.preload = preload;

        //normalize the volume and playback rate
        player.audio.volume = 1;
        player.audio.playbackRate = 1;

        //now bind an error event in case the SRC fails to load
        //saving the handler reference to the audiodesk object
        player.audiodesk.onerror = etc.listen(player.audio, 'error', function()
        {
            //we need to check the readyState because IE10 fires spurious error events
            //during audio preloading, even though the audio is fine and it's just bullshit
            //but allowing that process to happen would nullify the audio object
            //and therefore subsequent attempts to pause or control it would fail
            //resulting in cases where the audio keeps playing even though the video is paused
            //nb. although now we're silencing the error events onprogress and onloadedmetadata
            //and also because we don't actually support IE10 at all anymore,
            //this set of circumstances shouldn't happen, but let's leave the condition jic
            //nb. check the audio in case xad metadata failure has created an audio error state
            if(player.audio && player.audio.readyState < 2)
            {
                //if we've added the controls by now
                if(player.controlform)
                {
                    //disable the ad button and update it to the "off" state
                    //(so it's both grayed and dimmed, and clearly out of it!)
                    updateControlDisabled(player, 'ad', true);
                    updateControlState(player, 'ad', 'off');

                    //set aria-live on the button so that the error message is announced
                    //then update the button's aria-label with a short general error message
                    etc.render(player.controlform.ad,
                    {
                        'aria-live'     : 'assertive',
                        'aria-label'    : getLang(player, 'button-ad-error')
                    });
                }

                //*** DEV LOG (delay so our log function has an error reference)
                //etc.delay(200, function(){

                //nullify the player audio reference so we don't keep
                //trying to play and pause it, or keep having to
                //test its readyState to see if we can synchronise
                //we can also use this to detect existing failure
                //when we build the form if it isn't there already
                player.audio = null;

                //*** DEV LOG
                //});
            }
        });

        //also bind a progress event to update the ad button
        //during initial playback or preload until loading is underway
        //saving the handler reference to the audiodesk object
        player.audiodesk.onprogress = etc.listen(player.audio, 'progress', function()
        {
            //if the ready state is less than 2 then we're still waiting to load enough
            //nb. check the audio in case xad metadata failure has created an audio error state
            if(player.audio && player.audio.readyState < 2)
            {
                //if we've added the controls by now and playback
                //has already started and audio is currently enabled
                if(player.controlform && player.started && player.audiodesk.enabled)
                {
                    //update the button's aria-label to show the loading message
                    etc.render(player.controlform.ad,
                    {
                        'aria-label' : getLang(player, 'button-ad-loading')
                    });
                }
            }

            //else if the ready state is gte 2 then the audio is ready to play
            //nb. the audio synchronisation also checks the ready state
            //so it doesn't try to update the audio position until it's ready
            else
            {
                //if we've added the controls by now and the audio has not been nullified
                //nb. we check this in case xad metadata failure has created an audio error state
                if(player.controlform && player.audio)
                {
                    //update the button's aria-label
                    //to show the text corresponding with its state
                    //nb. we can't just assume they're on since it's
                    //possible the user has disabled them again in the meantime
                    etc.render(player.controlform.ad,
                    {
                        'aria-label' : getLang(player, 'button-ad-' + (player.audiodesk.enabled ? 'on' : 'off'))
                    });
                }

                //update the video and audio volume, also passing the muted flag
                //so we can mute it if applicable instead of changing the volume
                //(since muted audio doesn't return a zero volume)
                //nb. we have to do this now because any previous volume changes
                //including setting the default, won't have applied to the audio
                //nb. and we do this even if we don't have the volume control
                //so that synchronised audio volume will still be maintained
                setMediaVolume(player, player.media.volume, player.media.muted);

                //then silence this event as well as any loadedmetadata and error events
                player.audiodesk.onprogress.silence();
                player.audiodesk.onprogress = null;
                if(player.audiodesk.onloadedmetadata)
                {
                    player.audiodesk.onloadedmetadata.silence();
                    player.audiodesk.onloadedmetadata = null
                }
                if(player.audiodesk.onerror)
                {
                    player.audiodesk.onerror.silence();
                    player.audiodesk.onerror = null;
                }
            }

            //either way if we have enabled audio descriptions, synchronise the audio with the video
            //nb. the synchronise function itself will prevent this happening if the readyState is < 1
            if(player.audio && player.audiodesk.enabled)
            {
                audioSynchronise(player);
            }

            //*** DEV TMP
            //_.title = '['+new Date().getMilliseconds()+'] "'+(player.controlform?player.controlform.ad.title:'-')+'"';
        });

        //bind an additional loadedmetadata event in case the audio data is already fully loaded
        //in which case we won't get more than one progress event when enabling mid-playback
        player.audiodesk.onloadedmetadata = etc.listen(player.audio, 'loadedmetadata', function()
        {
            //if we've added the controls by now and the audio has not been nullified
            //nb. we check this in case xad metadata failure has created an audio error state
            if(player.controlform && player.audio)
            {
                //update the button's aria-label
                //to show the text corresponding with its state
                etc.render(player.controlform.ad,
                {
                    'aria-label' : getLang(player, 'button-ad-' + (player.audiodesk.enabled ? 'on' : 'off'))
                });
            }

            //update the video and audio volume, also passing the muted flag
            //so we can mute it if applicable instead of changing the volume
            //(since muted audio doesn't return a zero volume)
            //nb. we have to do this now because any previous volume changes
            //including setting the default, won't have applied to the audio
            //nb. and we do this even if we don't have the volume control
            //so that synchronised audio volume will still be maintained
            setMediaVolume(player, player.media.volume, player.media.muted);

            //then silence this event as well as any progress and error events
            player.audiodesk.onloadedmetadata.silence();
            player.audiodesk.onloadedmetadata = null;
            if(player.audiodesk.onprogress)
            {
                player.audiodesk.onprogress.silence();
                player.audiodesk.onprogress = null;
            }
            if(player.audiodesk.onerror)
            {
                player.audiodesk.onerror.silence();
                player.audiodesk.onerror = null;
            }

            //either way if we have enabled audio descriptions, synchronise the audio with the video
            //nb. the synchronise function itself will prevent this happening if the readyState is < 1
            if(player.audio && player.audiodesk.enabled)
            {
                audioSynchronise(player);
            }
        });

        //now bind some additional and permanent audio events, that simply maintain
        //the audio paused state if it differs from the video paused state
        //nb. this was needed in IE10 to cater for obscure circumstances, where
        //seeking past the preloaded data then playing and then pausing again quickly
        //can cause the audio object to keep playing; although we don't actually
        //support IE10 at all anymore, let's keep this conditon anyway, because
        //it should also help reduce the incidence of audio playing while video
        //is natively buffering, in cases where the buffer-size has been set to zero
        //** though we should probably remove the ability to configure the buffer-size
        etc.each(['progress','timeupdate','error'], function(type)
        {
            etc.listen(player.audio, type, function(e)
            {
                //nb. we need to check that the audio object is still here
                //in case a loading error has subsequently nullified it
                //** so we should probably also silence these events if that happens
                //nb. we don't play audio in regular sync with video if we have xad data
                //because xad cues are handled differently (see xadTracking for details)
                if(player.audio && !player.audio.paused && player.media.paused)
                {
                    if(!player.tracks.xad)
                    {
                        player.audio.pause();
                    }
                }
            });
        });

        //bind an audio ended event so that the audio paused flag maintains a
        //corresponding state, which doesn't happen in all native implementations
        //(and which we also do for the video, so the paused flag is always true when the media is not playing)
        etc.listen(player.audio, 'ended', function()
        {
            if(player.audio)
            {
                player.audio.pause();
            }
        });

        //finally define the SRC to kick all that off
        player.audio.src = player.audiodesk.src;
    }

    //synchronise the audio with the video, by comparing
    //and updating the audio time to match the video time
    function audioSynchronise(player)
    {
        //ignore this entirely if we have xad data
        //nb. we don't play audio in regular sync with video if we have xad data
        //because xad cues are handled differently (see xadTracking for details)
        //nb. we have to check that the tracks object is defined, because there
        //are edge circumstances where the first sync can be called before that
        //eg. media initialisation failures that don't define the interface
        //in which case the track loading method never gets called at all
        if(player.tracks && player.tracks.xad)
        {
            return;
        }

        //and since that edge case can happen, check that we actually have
        //video data, because if we don't then there's nothing to sync to anyway
        //and those circumstances would throw an error if we don't check first
        if(!etc.def(player.media.currentTime, null))
        {
            return;
        }

        //check that audio has sufficiently loaded, else we'll get an error
        //eg. if the audio is slow to load, or the user has no sound output
        //but first check that it still exists just in case it's fired an error
        //and there's a discontinuity between that and audio waiting states
        if(player.audio && player.audio.readyState >= 1)
        {
            //save the floored current time to the audiodesk sync time property
            //which we use to reduce the synchronisation frequency for safari's benefit
            //(see media timing and synchronisation timeupdate event for more notes)
            player.audiodesk.lastsync = Math.floor(player.media.currentTime);

            //then compare the audio and video times, and if they drift more
            //than [sync-resolution] apart, update the audio time to keep it in sync
            //nb. originally this was done by comparing ceil whole seconds, i.e.
            //if(Math.ceil(player.audio.currentTime) != Math.ceil(player.video.currentTime))
            //but that meant that even a tiny difference would register as one whole second
            //whereas (as I subsequently discovered, to some embarrassment) if we just leave
            //the audio alone it rarely drifts very far apart during normal conditions
            //and in fact the adjustments themselves contribute to the drift, requiring further
            //adjustments, in a vicious circle! so by comparing this way we actually reduce the
            //amount of adjustment we need to make, and that gives much better performance!
            //especially in win/firefox, in which the adjustments were causing audible artefacts
            //resulting in a jittery sound, which doesn't happen so much when we do it this way,
            //or rather, it still happens once adjustments have to be made, but this way
            //we have a much better chance of never having to make those adjustments
            //this is also better for opera next and safari because they mute the audio
            //while seeking, so continual re-syncing would mute it basically all the time
            //** when we do adjust once, it seems to be necessary every time from then on
            //** and is that because by the time we've set the time, the video time has changed?
            //** can we do anything about that if so, eg. time the average length of timeupdate
            //** events and than add or substract (whatever) the length of 1 event as well as the difference?
            if(Math.abs(player.audio.currentTime - player.media.currentTime) > config['sync-resolution'])
            {
                /*** DEV LOG ***//*
                if($this.logs.audio)
                {
                    audiolog([
                        ['AUDIO-SYNC-FIX', 18],
                        [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                        [player.audio.duration, 10],
                        [player.audio.currentTime, 0],
                        [' =&gt; ' + player.media.currentTime.toFixed(2), 0]
                        ],
                        ['<dfn>','</dfn>']);
                } */
                player.audio.currentTime = player.media.currentTime;
            }

            /*** DEV LOG ***//*
            else if($this.logs.audio)
            {
                audiolog([
                    ['AUDIO-SYNC-OK', 18],
                    [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                    [player.audio.duration, 10],
                    [player.audio.currentTime, 0],
                    [' (' + player.media.currentTime.toFixed(2) + ')', 0]
                    ],
                    ['<dfn>','</dfn>']);
            } */

            //if the video had to wait a long time to load then it's conceivable
            //that the audio has already ended before this synchronisation occurs
            //(ie. if you seek close to the end and the audio is ready before the video)
            //so if that's the case, resume playback from the synchronised position
            if(player.audio.paused && !player.media.paused)
            {
                player.audio.play();
            }

        }
    }


    //look in the player for text tracks data with applicable data,
    //and return either an object of the tracks data, or null if there aren't any
    function getTracksData(player, kind)
    {
        //define a null tracks object by default
        var tracks = null;

        //if this is the audio-only player, and either the kind is xad
        //or [the kind is captions or transcript and] we have no transcript,
        //just return the null object without parsing since we don't need the data
        //nb. the audio-only player doesn't support audio-descriptions and doesn't
        //have captions, so we'll only need captions data if we have a transcript
        if(player.isaudio && (kind == 'xad' || !player.transcript))
        {
            return tracks;
        }

        //get the user's language, so we can use it to index the tracks object
        //just in case any of the tracks don't have an srclang defined
        //nb. browsers vary in which of these two properties they support
        //some support both, and some only support one or the other
        //but wherever both are defined they're reliably always
        //the same, so it doesn't matter which order we check them
        //nb. convert the code to lowercase for simplicity, because
        //some regional variants are canonically uppercase, eg. "en-US"
        var userlang = (navigator.userLanguage || navigator.language).toLowerCase(),

        //*** DEV TMP
        //userlang = 'de',

        //create flags for the first captions track that has the default attribute
        //(which specifies which captions track to show by default, if any)
        //and the first captions track that has the data-default-transcript attribute
        //(which specifies which to use for the default transcript if captions are off by default)
        defaultTrack = null,
        defaultTranscript = null,

        //create an array for recording which language codes are defined
        //so we can treat those members as a subset for counting and iteration
        languages = [];

        //now iterate through the collection of <track> elements
        //inside the player container, and for each of the specified kind
        //nb. if kind is "captions" it matches the kind attribute, but if kind is
        //"transcript" or "xad" it matches the data-kind attribute where kind is "metadata"
        etc.each(etc.get('track', player.container), function(track, key)
        {
            if
            (
                (
                    kind == 'captions'
                    &&
                    track.getAttribute('kind') == kind
                )
                ||
                (
                    (kind == 'transcript' || kind == 'xad')
                    &&
                    track.getAttribute('kind') == 'metadata'
                    &&
                    track.getAttribute('data-kind') == kind
                )
            )
            {
                //if the kind is "xad" set an srclang attribute of "en" on the track in case
                //another srclang has been defined, because xad metadata is always in english
                //nb. this also means that if multiple xad tracks are defined, only the last one
                //will be used, which is helpful since you can't have multiple xad metadata
                if(kind == 'xad')
                {
                    track.setAttribute('srclang', 'en');
                }

                //add a new object to the tracks, indexed by srclang
                //which we get from the track's "srclang" attribute, or use
                //the user language if that's undefined, also lowercased
                //creating the top-level object from null if necessary
                //and defining the track src and an empty cues array
                //plus a visible label or the language code if empty or undefined
                //and a readyState flag for tracking the load state of this data
                //=> 1 means we haven't tried yet
                //=> 2 means we're loading at the moment
                //=> 0 means they failed to load, or some other error
                //=> 4 means they loaded successfully and we're all good
                //nb. if there are multiple tracks with no defined srclang
                //then each one we find will over-write the previous one
                if(!tracks)
                {
                    tracks = {};
                }
                tracks[key = (track.getAttribute('srclang') || userlang).toLowerCase()] =
                {
                    src         : track.getAttribute('src'),
                    label       : (track.getAttribute('label') || key),
                    readyState  : 1,
                    cues        : []
                };

                //if the kind is not xad
                //add this key to the languages array if it's not already present
                if(kind != 'xad' && etc.find(languages, key) < 0)
                {
                    languages.push(key);
                }

                //if the track has a data-sync attribute, parse its
                //value to a float and add it to the track object
                //nb. using a coerced test to exclude undefined or empty values
                if(track.getAttribute('data-sync'))
                {
                    tracks[key].sync = parseFloat(track.getAttribute('data-sync'));
                }

                //if the kind is "captions"
                if(kind == 'captions')
                {
                    //if this track has the default attribute
                    //and we haven't already recorded a default track
                    //nb. if more than one track has the default attribute,
                    //then the native implementation will use the first one
                    //so we follow that by only paying attention to the first one
                    //nb. we have to check against null not just loosely false, because
                    //[default=""] and [default] are validly the same as [default="default"]
                    if(track.getAttribute('default') !== null && defaultTrack === null)
                    {
                        //set the default track to this
                        defaultTrack = key;
                    }

                    //if the track has the data-default-transcript attribute
                    //and we haven't already recorded a default transcript track
                    //nb. this follows the same first-only rule as the default track
                    if(track.getAttribute('data-default-transcript') !== null && defaultTranscript === null)
                    {
                        //set the default transcript track to this
                        defaultTranscript = key;

                        //if this is the audio-only player, copy that key to defaultTrack
                        //so that captions show as enabled rather than off
                        //since the transcript is never off unless it's failed to load
                        //(so the multi-lang transcript menu won't usually have an off item)
                        if(player.isaudio)
                        {
                            defaultTrack = key;
                        }
                    }
                }

                //then if the kind is captions and we have native track support
                //nb. we'll need to interact with this in devices which use the
                //webkit-video fullscreen model and support native tracks (ie. iOS7+)
                //so that we can show native captions in fullscreen mode or playsinline
                if(kind == 'captions' && etc.def(player.video.textTracks))
                {
                    //if this is anything except iOS, remove the track entirely
                    //which fixes a problem in desktop safari 7 whereby the native captions
                    //would show as well as the custom captions, even though we disable them
                    //but since only iOS7+ uses the native captions anyway,
                    //we can just remove them entirely to fix that problem
                    if(!defs.agent.ios)
                    {
                        etc.remove(track);
                    }

                    //else [if this is iOS]
                    else
                    {
                        //save a native textTrack object reference to the dictionary
                        tracks[key].textTrack = track.track;

                        //*** DEV TMP
                        //console.warn('tracks["' + key + '"].textTrack');
                        //console.log(tracks[key].textTrack);

                        //now set the textTrack mode to "showing" if it matches
                        //the default and this is an iphone, otherwise to "disabled"
                        //nb. this is so native captions show for playsinline on the iphone
                        //but won't show as duplicates to custom captions on the ipad
                        //nb. although the iphone's native inline interface has
                        //no way of controlling them, that control is available
                        //in the full-screen interface, so this sets the inline
                        //default to matches whatever the author sets as default
                        //then users can change enabled or language in full-screen
                        //nb. if no track is set to default, the iphone might select
                        //"Auto (recommended)" and show captions by default anyway
                        //presumably using the track language matching the phone's language
                        //this appears to be related to the "Closed Captions + SDH" option
                        //(found in General > Accessibility > Subtitles & Captioning)
                        //because when I turned that off and on again, it stopped happening
                        //which is kinda hmm, I was expecting it would stop when that setting
                        //was off and happen again when the setting was on again, so not sure
                        //but anyway, I think that's probably it, so if users set that on
                        //their phone then captions should/might always show by default
                        //regardless of author default settings (which is desirable behaviour)
                        //and if that's flaky or unreliable, well that's Apple's problem not mine
                        track.track.mode = (defs.agent.iphone && defaultTrack === key) ? 'showing' : 'disabled';

                        //also save an owner node reference in case we need to remove the track
                        //ie. in the case of load failures so we can remove it from the native collection
                        tracks[key].owner = track;
                    }
                }

                //else [if the kind is transcript or xad or we don't have
                //native track support] we can just remove the track
                //since even the native captions won't require transcript data
                else
                {
                    etc.remove(track);
                }
            }
        });

        //then if we have any tracks (ie. if tracks is not still null)
        if(tracks)
        {
            //then if the kind is "captions"
            //nb. we can't set the selected flag for the transcript
            //until after we've got the data for the captions as well
            //and since we can't guarantee the order in which their
            //tracks are defined, we can't do it until we've done both
            if(kind == 'captions')
            {
                //save the languages array
                tracks.languages = languages;

                //create an object of keys for the currently selected language
                //used by the captions and the transcript output
                //nb. we need separate flags because the transcript will still
                //need to be compiled and highlighted even if captions are off
                tracks.selected =
                {
                    captions    : null,
                    transcript  : null
                };

                //create a flag to indicate whether we have multiple languages
                //nb. we can't just count the languages array on the fly each time
                //we need to know whether there are multiple languages, because
                //that won't differentiate between having only one language to
                //begin with, and only have one left after others failed to load
                tracks.i18n = tracks.languages.length > 1;

                //create a flag for whether captions are enabled by default
                tracks.enabled = false;

                //if we have a default track key
                if(defaultTrack !== null)
                {
                    //copy its value to the track selected captions and transcript keys
                    tracks.selected.captions = tracks.selected.transcript = defaultTrack;

                    //set the captions enabled flag
                    tracks.enabled = true;
                }

                //else if no tracks are default (ie. captions are off by default)
                else
                {
                    //set the selected captions to off
                    tracks.selected.captions = 'off';

                    //if we have a default transcript key, set the selected transcript to that
                    //so that that track can be used to generate the default transcript
                    if(defaultTranscript !== null)
                    {
                        tracks.selected.transcript = defaultTranscript;
                    }

                    //otherwise just use the first one we found
                    //(which will be the only one if there's only one language)
                    else
                    {
                        tracks.selected.transcript = tracks.languages[0];
                    }

                    //but if this is an audio-only player
                    if(player.isaudio)
                    {
                        //override the selected captions flag to match the transcript
                        //so that the multi-language menu selection will match by default
                        tracks.selected.captions = tracks.selected.transcript;

                        //then set the captions enabled flag so they don't show as off
                        tracks.enabled = true;
                    }
                }
            }
        }

        //then return the tracks object (or null)
        return tracks;
    }


    //load and parse a VTT file by track src, using the data to
    //populate a cues array, which we then pass back through oncomplete
    //or if the data fails to load or parse then call onfail instead
    function getTrackVTT(track, idx, kind, lang, oncomplete, onfail)
    {
        //define a local abstraction for parsing the loaded text
        //and then calling oncomplete with the finished cues array
        //nb. defining an inner function like this is somewhat inefficient
        //since it's being redefined every time the parent function is called
        //but the advantage of having closure access to the parent arguments
        //outweights the disadvantage, given how infrequently it's called
        //ie. the parent function won't be called more than once per track type
        //(so three times: for captions, transcript and xad; if all three are defined)
        function parseTrackVTT(vtt)
        {
            //trim the data, normalize line-breaks to unix, then split by empty lines
            //** what about removing null characters U+0000 (what are they, and when do they appear?)
            vtt = etc.trim(vtt.replace(/(\r[\n\f]?)/g, '\n')).split(/^[\s]*$/m);

            //*** DEV TMP
            //try
            //{
            //    console.log(
            //        '############################################################\n'
            //        + vtt.join('\n================================================\n')
            //        +'\n############################################################'
            //        );
            //}
            //catch(ex){}

            //*** DEV TMP
            //var cuedevdata = {};

            //create an empty cues array for storing processed cues
            //then start an asynchronous processor to iterate through the lines of VTT text
            //nb. we need the APU to prevent older browsers or less powerful computers
            //from throwing an unresponsive script warning over large data sets
            //eg. when the VTT file contains more than an hour of captions data
            //but we can use a high chunksize because the iterative process is quite light
            var cues = [];
            new APU(100,

            //when the processor iterates
            function(i)
            {
                //if we've run out of cues to check, then proceed straight to completion
                //nb. we have do this at the start in case the file is empty
                if(!etc.def(vtt[i]))
                {
                    return this.complete();
                }

                //else if this cue contains the file signature or a note,
                //splice it from the array and continue to the next one
                //nb. specify a zero increment since we've spliced one from
                //the array, otherwise we'll lose the line that comes after it
                //nb. we don't verify that the file signature is present
                //otherwise we wouldn't be able to support SRT files
                //the WebVTT specification also says that "WEBVTT" should be
                //the first 6 characters (ie. not preceded by any whitespace)
                //but I don't think it's necessary to enforce that requirement
                if(/^\s*(WEBVTT|NOTE)/.test(vtt[i]))
                {
                    vtt.splice(i, 1);
                    return this.next(0);
                }

                //[else] create a new cue object for this cue
                //then trim and split the cue by individual lines
                var
                cue = {},
                lines = etc.trim(vtt[i]).split(/^/m);

                //if the first line doesn't contain the "-->" timing delimiter
                //then it should be the cue id, so trim and extract the first set of
                //non-space characters, and define that for the cue object id
                //then shift it off the lines array to get it out of the way
                if(lines[0].indexOf('-->') < 0)
                {
                    cue.id = etc.trim(lines[0]).replace(/^([\S]+).*/, '$1');
                    lines.shift();
                }

                //then if [what's now] the first line doesn't contain the timing delimiter
                //or if we don't even have any more lines (eg. the file isn't captions data)
                //then this cue has been mis-defined, so continue to the next cue
                //but first show a console info with the invalid cue message
                //(therefore each invalid cue will generate a separate warning)
                //** be nice if we could give line numbers for this, but not sure how
                if(!lines[0] || lines[0].indexOf('-->') < 0)
                {
                    etc.console(etc.sprintf(config.lang['vtt-invalid-cue'], { src : track.src }), 'warn');
                    return this.next();
                }

                //[else] if we don't have cue id then create one from its index + 1
                //nb. using 1-based numbering because that's more user friendly
                //but it still has to be a string so that all ids are the same data type
                cue.id = cue.id || (cues.length + 1).toString();

                //then if the cue id prefix is specified, add it at the start of the id
                //nb. this is so we can differentiate otherwise-identical generated ids
                if(idx !== null)
                {
                    cue.id = idx + cue.id;
                }

                //then specify the cue kind, either "caption" or "transcript"
                //according to the input argument, which affects the output markup
                cue.kind = kind;

                //also specify the language code, for later use in the lang attribute
                cue.lang = lang;

                //now shift that first line to get it out of the way again
                //and extract the individual start and end timestamps from it
                //then parse those into absolute offsets and save them to startTime and endTime
                //and round the resulting numbers to three significant digits,
                //so we discard precision errors that produces timings like 7.00000001
                //nb. the timestamp regex is very basic and will allow invalid numbers
                //it allows the european "," instead of "." for the milliseconds to support SRT
                //nb. any cue settings (defined after the end timestamp) will be ignored
                lines.shift().replace(/((?:[\d]+[\:\.\,]?){3,4})(?:\s+\-\->\s+)((?:[\d]+[\:\.\,]?){3,4})/,
                function(all, start, end)
                {
                    cue.startTime = Math.round(library.getStampTime(start) * 1000) / 1000;
                    cue.endTime = Math.round(library.getStampTime(end) * 1000) / 1000;

                    //if the track has a sync value [which isn't zero or NaN]
                    //increment the startTime and endTime by that many seconds
                    //nb. the sync value allows you to globally adjust the cue timings
                    //for situations where it's impractical or impossible to edit the VTT
                    //eg. when proxy-loading a remote file from a third-party repository
                    //to sync over a youtube video to which the owner has added extra content
                    //such as a production credit at the start, which throws out all the timings
                    //the value itself is a postive increment defined in seconds, and can be
                    //either positive or negative to adjust the timings in either direction
                    //ie. positive makes the captions appear later, or negative is sooner
                    //nnb. although I wasn't initially sure which whether positive should be
                    //later or sooner, but VLC does it this way, so I've done that too
                    if(track.sync)
                    {
                        cue.startTime += track.sync;
                        cue.endTime += track.sync;
                    }

                    //then if the start time of this cue is zero or less,
                    //change it to 0.002, so that the caption doesn't appear
                    //when resettting the video back to the very beginning
                    //ie. it only appears after the video starts to play
                    //nb. this also handles cases where the track sync is negative
                    //resulting in a cue that would otherwise have negative timing
                    if(cue.startTime <= 0)
                    {
                        cue.startTime = 0.002;
                    }

                    //then if the end time is less than the start, make them the same
                    //which does of course mean that the cue won't appear (though wouldn't
                    //have done anyway with negative timing) but it normalizes the numbers
                    //so that any mathematical comparison will infer the correct order
                    //nb. this of course also limits the minimum endTime to 0.002
                    //also do this if the kind is xad since we don't use the endTime
                    //but normalize it for sanity just in case its defined incorrectly
                    if(cue.endTime < cue.startTime || kind == 'xad')
                    {
                        cue.endTime = cue.startTime;
                    }
                });

                //just in case the parser was fooled by an invalid cue which
                //nevertheless contained the timing delimiter, then the
                //startTime and endTime will be undefined, so if they are
                //then just ignore this cue and continue to the next one
                //but first show a console info with the invalid cue message
                //(therefore each invalid cue will generate a separate warning)
                //** be nice if we could give line numbers for this, but not sure how
                if(!etc.def(cue.startTime) || !etc.def(cue.endTime))
                {
                    etc.console(etc.sprintf(config.lang['vtt-invalid-cue'], { src : track.src }), 'warn');
                    return this.next();
                }

                //[else] re-join the remaining lines (with a unix line-break for internal consistency)
                //trim the result, and if it's not empty then save it to the cue text
                //then parse any links to add (or replace) target="_blank"
                //nb. links aren't formally supported, this is not documented anywhere
                //because I'm not sure if it's a good idea, and it would violate focus order
                //since the captions are inserted after the controls but are visual before them
                //(they have to be inserted after to fix an obscure JAWS bug; see controlform defintion)
                if((lines = etc.trim(lines.join('\n'))) !== '')
                {
                    cue.text = lines;

                    if(/<a/i.test(cue.text))
                    {
                        //** should we allow for target attributes which have no quotes, or single quotes?
                        cue.text = cue.text.replace(/target=\"[^\"]+\"/ig, '').replace(/(<a)/ig, '$1 target="_blank"');
                    }

                    //then if the kind is xad we need to parse the cue text to get the time information
                    if(kind == 'xad')
                    {
                        //extract the individual start and end timestamps from the xad() command
                        //then parse those into absolute offsets and save them to startAudio and endAudio
                        //nb. the timestamp regex is very basic and will allow invalid numbers
                        //but it also allows the european "," instead of "." for the milliseconds
                        //nb. the command name is case-insensitive so xad() and XAD() are allowed
                        //nb. anything defined after the timestamp end bracket will be ignored
                        //multiple xad() commands are also ignored (ie. we only keep the first)
                        cue.text.replace(/^xad\(((?:[\d]+[\:\.\,]?){3,4})(?:\s+\-\->\s+)((?:[\d]+[\:\.\,]?){3,4})\)/i,
                        function(all, start, end)
                        {
                            cue.startAudio = Math.round(library.getStampTime(start) * 1000) / 1000;
                            cue.endAudio = Math.round(library.getStampTime(end) * 1000) / 1000;
                        });

                        //if we don't have startAudio and endAudio values then the command was improperly defined
                        //so there's no point creating a cue for it, so just continue to the next cue
                        //but first show a console info with the invalid xad message
                        //(therefore each invalid command will generate a separate warning)
                        //** be nice if we could give line numbers for this, but not sure how
                        if(!(typeof(cue.startAudio) == 'number' && typeof(cue.endAudio) == 'number'))
                        {
                            etc.console(etc.sprintf(config.lang['vtt-invalid-xad'], { src : track.src }), 'warn');
                            return this.next();
                        }

                        //[else] normalize endAudio so it can't be earlier than startAudio
                        if(cue.endAudio < cue.startAudio)
                        {
                            cue.endAudio = cue.startAudio;
                        }

                        //define a playstate flag on the cue (see xadTracking for details)
                        //0 = unplayed (future)
                        //1 = ready to be played
                        //2 = playing
                        //3 = just played
                        //4 = played (past)
                        cue.playstate = 0;
                    }
                }

                //but if it is empty, there's no point creating a cue for it at all
                //since we'd have no data in it, so just continue to the next cue
                //but first show a console info with the invalid cue message
                //(therefore each invalid cue will generate a separate warning)
                else
                {
                    etc.console(etc.sprintf(config.lang['vtt-invalid-cue'], { src : track.src }), 'warn');
                    return this.next();
                }

                //finally add this cue object to the cues array
                cues.push(cue);


                //*** DEV TMP
                //cuedevdata[cue.id] = {startTime:cue.startTime,endTime:cue.endTime,duration:(etc.def(cue.duration)?cue.duration:null),text:cue.text,kind:cue.kind,lang:cue.lang};

                //*** DEV TMP
                //if(__.console) { console.log('id\t"'+cue.id+'"\n'+ 'startTime\t'+cue.startTime+'\n'+ 'endTime\t'+cue.endTime+'\n'+ 'text\t"'+cue.text+'"\n'+ ''); }

                //else continue to process the next cue
                return this.next();
            },

            //when the processor completes
            function()
            {
                //just in case the cues array is empty, call onfail with an error code
                //which is only likely to happen if the file is empty, or only contains notes
                //(though it will also happen if the text isn't VTT data at all)
                //nb. using code 415 (unsupported media type) to indicate this situation
                if(cues.length == 0)
                {
                    return onfail(415);
                }

                //*** DEV TMP
                //if(console.table) { console.table(cuedevdata); }

                //else call oncomplete with the finished cues array
                return oncomplete(cues);

            //start the processor
            }).start();
        }

        //now try load the specified track src, and if that loads
        //then pass the response text to the parsing function
        //nb. don't check the content type because that's causing problems for author
        //who don't have access to their server config, so just accept anything
        //and try to parse it (and parsing will fail if it's not VTT or SRT data)
        //nb. don't normally use the nocache flag because caching is a good thing!
        //but it can be counter-productive during development, so we define
        //a config property that specifies whether to use nocache or not
        etc.load(track.src, config['captions-nocache'], function(data, status, type)
        {
            if(data !== null)
            {
                return parseTrackVTT(data);
            }
            return onfail(status);
        });
    }


    //search a captions cues array for a caption matching the current time
    //and return the cue object, or null if there is no cue for this time
    function getTimeCaption(cues, time)
    {
        //assume by default that there is no caption for the time
        var timecue = null;

        //then iterate through the cues array and look for one that matches
        //ie. whose startTime and endTime straddle either side of the time
        //nb. we don't currently support multiple cues at the same time point
        //so if there are any overlapping we'll just select the first one we find
        etc.each(cues, function(cue)
        {
            if(time >= cue.startTime && time < cue.endTime)
            {
                timecue = cue;
                return false;
            }
        });

        //then return the timecue, or null if we didn't find one
        return timecue;
    }


    //convert the text from a single cue, which may also contain vtt markup,
    //into the HTML for a single caption or transcript entry
    function getCueHTML(cue, speaker)
    {
        //*** DEV TMP
        //speaker = false;

        //define an array for storing the individual paragraph lines
        //and a separate array for storing the voice name for each line
        //nb. we need to build an array rather than just compiling the final
        //html string as we go along (like we did before) because we'll need
        //to evaluate the final collection to work out when voice changes occur
        var
        lines = [],
        voices = [];

        //split the cue text by trimmed line-breaks and iterate through the resulting array
        //nb. usually this will only be a single member, but it can be two or more
        etc.each(cue.text.split(/\s*^\s*/m), function(line, i)
        {
            //parse this line to extract any voice information, and to convert the cue text to markup
            line = line.replace(/^(?:<v(?:((?:\.[-\w]+)*)\s+([^>]+))?>)?(.*)$/mig, function(all, voiceclass, voice, content)
            {
                //if we have any voiceclass data, split it into individual values
                //otherwise create an empty array so we can test it universally
                //nb. the voiceclass argument might be undefined OR empty string
                //so we have to test with coercion rather than etc.def(voiceclass)
                //otherwise we could create an array with a single empty string member
                voiceclass = voiceclass ? voiceclass.substr(1).split('.') : [];

                /*** DEV TMP ***//***
                console.group();
                console.log(all);
                console.log(voiceclass);
                console.log(voice);
                console.log(content);
                console.groupEnd(); ***/

                //if the speaker argument is false but the important flag was
                //present on the <v> element, then enable the showspeaker flag
                //nb. this can be used to denote that a speaker name should be shown
                //in a caption, where they're usually only shown in the transcript
                //nnb. we need a separate var from the input speaker argument
                //since its value might change between iterations of this loop
                //nb. don't remove the important flag from the voiceclass array
                //so that it also gets output as a class on the captions <p> element
                //just in case it's useful to authors as a secondary styling hook
                var showspeaker = speaker;
                if(!showspeaker && etc.find(voiceclass, 'important') > -1)
                {
                    showspeaker = true;
                }

                //remove any closing </v> tags from the line content
                //nb. this is an over-simplification as it doesn't allow for lines
                //where the voice is only part of the line, e.g. "<v>foo</v> bar"
                //** and are voice tags that span multiple lines allowed?
                content = content.replace(/<\/v>/g, '');

                //add the whitepsace-trimmed voice name or null to the voices array
                //while copying the trimmed version back to the local argument
                //nb. if voice is undefined then trim will just return undefined
                voices.push((voice = etc.trim(voice)) || null);

                //if the showspeaker flag is true and we have a voice name
                //then parse the string of any leading dash, since dashes
                //are commonly used to indicate different speakers in a
                //single cue, but we don't need them if we have a a voice citation
                if(showspeaker && voice)
                {
                    content = content.replace(/^[-]\s*/, '');
                }

                //then compile the line by defining a <p>, then a <q> pair for "captions" kind
                //cues which includes a [data-voice] attribute on the <p> if we have a voice,
                //as well as the <p> including any classes defined on the <v> element itself
                //and also including a leading speaker citation if the showspeaker argument is true
                //ie. so we'll get either <p data-voice="foo"><q> or just <p><q>
                //or if showspeaker is true then we'll get <p data-voice="foo">{SPEAKER}<q>
                //nb. we need two elements here so we can have a wrapping block
                //to put each caption cue line on its own line, but also an inline element
                //so it can have a background color which will only apply to the line boxes
                //nnb. although the transcript doesn't need that, it's just for dialog semantics
                return '<p'
                        + (voice ? (' data-voice="' + voice + '"') : '')
                        + (voiceclass.length > 0 ? (' class="' + voiceclass.join(' ') + '"') : '')
                        + '>'
                        + (showspeaker && voice ? etc.sprintf('<cite>%voice:</cite>\x20', { voice : voice }) : '')
                        + (cue.kind == 'captions' ? '<q>' : '')
                        + content
                        + (cue.kind == 'captions' ? '</q>' : '')
                        + '</p>';
            });

            //extract any <c.foo> tags and convert them to <span class="foo">
            //replacing any dots with spaces to allow for multiple classes
            line = line.replace(/<\/c>/g, '</span>').replace(/<c\.([\.\w]+)>/ig, function(all, value)
            {
                return '<span class="' + value.replace(/\./g, ' ') + '">';
            });

            //extract any <lang foo> tags and convert them to <span lang="foo">
            line = line.replace(/<\/lang>/g, '</span>').replace(/<lang([^>]+)>/ig, function(all, value)
            {
                return '<span lang="' + etc.trim(value) + '">';
            });

            //*** DEV TMP
            //console.log(line);

            //then add this line to the array
            lines.push(line);
        });

        //begin compiling an HTML string
        //specifying the cue kind using a "data-kind" attribute
        //and specifying the cue id in a "data-cue" attribute
        //and specifying the cue lang in a "lang" attribute
        //nb. we can't just use "id" because the cue id might be
        //purely numeric, but HTML IDs can't start with a number
        //also because we'd get duplication with the transcript
        var html = '<div'
                    + ' data-kind="' + cue.kind
                    + '" lang="' + cue.lang
                    + '" data-cue="' + cue.id
                    + '">';

        //iterate through the lines and add the data-voice-alt attribute
        //each time we encounter a change of voice within the caption
        //unless the previous line already had the data-voice-alt attribute
        var voicealt = false;
        etc.each(lines, function(line, i)
        {
            if(i > 0 && voices[i] != voices[i - 1])
            {
                voicealt = !voicealt;
            }
            if(voicealt)
            {
                lines[i] = line.replace('<p', '<p data-voice-alt="true"');
            }
        });

        //*** DEV TMP
        //console.log(lines.join('\n'));

        //join and add the individual lines
        html += lines.join('');

        //finally add the closing tag and return the final HTML string
        return html + '</div>';
    }


    //get a value from the language dictionary, including conversion
    //of keys where applicable to support the audio-only player
    //nb. for the sake of efficiency, we only use this abstraction
    //for language that's ever likely to need conversion, i.e. interface
    //language such as button and menu text and labels, but not global error
    //messages, or things like VTT parsing warnings and media error messages
    //it also doesn't include slider language because they have no player reference
    function getLang(player, langkey)
    {
        //if this is an audio-only player, we need to do some language conversions
        //e.g. the CC menu only controls the transcript since there are no captions
        //so its text and labels should refer to the transcript not the captions
        if(player.isaudio)
        {
            //button labels
            etc.each(['off','lang','loading','nolang'], function(key)
            {
                langkey = langkey.replace('button-cc-' + key, 'transcript-' + key);
            });

            //button fallback text
            etc.each(['off','on','lang','loading'], function(key)
            {
                langkey = langkey.replace('text-cc-' + key, 'text-tr-' + key);
            });
        }

        //return the specified language
        return config.lang[langkey];
    }


    //aynchronous processing unit, which is used for
    //parsing captions files and generating the transcript
    //nb. this is an edited and abridged version of APU2.2
    //=> http://www.brothercake.com/site/resources/scripts/apu/
    function APU(ks, ni, nc, na)
    {
        this.g = function(v, f)
        {
            return (typeof v == 'number' && v >= 0 ? parseInt(v, 10) : f);
        };

        var
        a    = this,
        t    = null,
        k    = 0,
        ks    = (this.g(ks, 1) || 1);

        this.i    = 0;
        this.s    = false;

        this.fn = function(fn)
        {
            if(typeof fn == 'function')
            {
                fn.call(this, this.i);
            }
        };

        this.dc = function()
        {
            this.fn(nc);
        };

        this.di = function(s)
        {
            if(s)
            {
                k = ks - 1;
            }
            if(a.i == 0)
            {
                this.fn(ni);
            }
            else if((++ k) == ks)
            {
                k = 0;
                t = __.setTimeout(function()
                {
                    a.fn(ni);

                }, a.g(s, 10));
            }
            else
            {
                this.fn(ni);
            }
        };

        this.da = function()
        {
            __.clearTimeout(t);

            this.fn(na);
        };
    }
    APU.prototype =
    {
        start : function()
        {
            this.i = 0;
            this.s = false;

            this.di();
        },
        next : function(i, s)
        {
            if(this.s) { return; }

            this.i += this.g(i, 1);
            this.di(s);
        },
        complete : function()
        {
            if(this.s) { return; }

            this.s = true;
            this.dc();
        }
    };







    //### PHP ###// <?php if(isset($_GET['fork']) && ($_GET['fork'] == 'free' || $_GET['fork'] == 'subs')): ?>

    //-- private => validation and referencing function (FREE / SUBSCRIPTION VERSION) --//
    function $$(x)
    {
        //*** DEV TMP VALIDATION
        //_.title = '[F/S]';
        //if(window.console){window.console.log(_.title);}

        //*** DEV TMP (convert a string to zero-padded character codes)
        //function zeropad(n, length)
        //{
        //    while((n = n.toString()).length < (length || 2))
        //    {
        //        n = '0' + n;
        //    }
        //    return n;
        //}
        //var
        //hostname = 'cakebook.local',
        //codes = '';
        //for(var len = hostname.length, i = 0; i < len; i ++)
        //{
        //    codes += zeropad(hostname.charCodeAt(i), 3);
        //}
        //console.log(codes);

        //get the src of this script, which will be the last in the scripts collection
        //since the script is not deferred and therefore blocks rendering while it's executed
        //then derive the hostname by splitting the resulting URL by slashes
        //and extracting the value that logically corresponds with the hostname
        //nb. we can obfuscate these queries to some extent to help with the overall obfuscation effort
        //eg. with hex sequences instead of literal strings to help disguise what we're doing
        //which are also split into parts for when the output is beautified into literal characters
        //so you wouldn't find this code by searching for any references to "script" or "src"
        //nb. port numbers are not parsed out, so any port number will fail authentication
        //nb. if the code is directly inside a <script> then it won't have an src
        //so we allow for that possibility and create an empty-string for the (invalid) hostname
        var
        s = etc.get('\x73\x63'+'\x72\x69'+'\x70\x74').pop(),
        h = (s['\x73'+'\x72'+'\x63']||'\x2f\x2f').split('\x2f')[2];

        //now define a three-digit zeropad function to use with name encoding
        function z(n)
        {
            while((n = n.toString()).length < 3)
            {
                n = '\x30' + n;
            }
            return n;
        }

        //then encode the hostname into zero-padded character codes
        for(var c = '', l = h.length, i = 0; i < l; i ++)
        {
            c += z(h['\x63\x68'+'\x61\x72'+'\x43\x6f'+'\x64\x65'+'\x41\x74'](i));
        }

        //finally set an initial supported flag on the input reference
        //using true if we pass validation or false if we fail
        //nb. this domain decodes as "ozplayer.global.ssl.fastly.net"
        x['\x73\x75\x70'+'\x70\x6f\x72'+'\x74\x65\x64'] = c === '111122112108097121101114046103108111098097108046115115108046102097115116108121046110101116';

        //*** DEV TMP VALIDATION (localhost | cakebook | cakebook.local)
        //x['\x73\x75\x70'+'\x70\x6f\x72'+'\x74\x65\x64'] = c === '108111099097108104111115116' || c === '099097107101098111111107' || c === '099097107101098111111107046108111099097108';
        //*** DEV TMP VALIDATION (192.168.1.3)
        //x['\x73\x75\x70'+'\x70\x6f\x72'+'\x74\x65\x64'] = c === '049057050046049054056046049046051';
        //*** DEV TMP VALIDATION (cakebook.local)
        //x['\x73\x75\x70'+'\x70\x6f\x72'+'\x74\x65\x64'] = c === '099097107101098111111107046108111099097108';
        //*** DEV TMP VALIDATION (always allowed)
        //x['\x73\x75\x70'+'\x70\x6f\x72'+'\x74\x65\x64'] = true;
        //*** DEV TMP VALIDATION (always fail)
        //x['\x73\x75\x70'+'\x70\x6f\x72'+'\x74\x65\x64'] = false;

        //*** DEV TMP VALIDATION
        //if(!x.supported) { _.title += '[-]'; }
        //else             { _.title += '[+]'; }
        //if(window.console){window.console.log(_.title);}

        //then return the reference
        return x;
    }

    //### PHP ###// <?php else: ?>

    //-- private => validation and referencing function (PAID VERSION) --//
    function $$(x)
    {
        //*** DEV TMP VALIDATION
        //_.title = '[P][+]';
        //if(window.console){window.console.log(_.title);}

        //set an initial supported flag on the input reference
        x.supported = true;

        //then return the reference
        return x;
    }

    //### PHP ###// <?php endif; ?>







    /*** DEV LOG ***//*

    //save references to the logs and define their filter controls
    etc.each($this.logs = { video : etc.get('#videolog'), audio : etc.get('#audiolog') }, function(log, type)
    {
        if(log && window.localStorage && window.JSON)
        {
            log.filterstates =
            {
                progress    : true,
                timeupdate    : true,
                autoscroll    : true
            };

            var storedstates = window.localStorage['filterstates-' + type];
            if(storedstates)
            {
                log.filterstates = JSON.parse(storedstates);
            }

            var filters = [];
            etc.each(log.filterstates, function(on, key)
            {
                filters.push
                (
                    etc.build('input',
                    {
                        'type'        : 'checkbox',
                        'name'        : key,
                        'id'        : 'log-' + type + '-filter-' + key,
                        '.log'        : log,
                        'onchange'    : function()
                        {
                            this.log[this.checked ? 'setAttribute' : 'removeAttribute']('data-filter-' + this.name, 'true');

                            log.filterstates[this.name] = this.checked;
                            window.localStorage['filterstates-' + type] = JSON.stringify(log.filterstates);
                        }
                    }),
                    etc.build('label',
                    {
                        '#text'    : key,
                        'for'    : 'log-' + type + '-filter-' + key
                    })
                );
            });
            filters = etc.build('form',
            {
                '=after' : log,
                '#dom'   : filters
            });
            etc.each(log.filterstates, function(on, key)
            {
                if(on)
                {
                    filters.elements[key].checked = true;
                    log.setAttribute('data-filter-' + key, 'true')
                }
            });
        }
    });
    //add trailing spaces to a string to make it a fixed length
    //excluding any markup in the string because it has no visible length
    function space(str, len)
    {
        str = (str || '').toString();
        while(str.replace(/<[\/]?[^>]+>/g, '').length < len)
        {
            str += '\xa0';
        }
        return str;
    }
    //format and add data to the log if present
    function videolog(data, tags)
    {
        log($this.logs.video, data, tags);
    }
    function audiolog(data, tags)
    {
        log($this.logs.audio, data, tags);
    }
    function log(thislog, data, tags)
    {
        //exit if there's no log
        if(!thislog) { return; }

        //if data is defined
        if(etc.def(data))
        {
            //create a millisecond timestamp
            var
            now = new Date(),
            time = [];
            etc.each(['Hours','Minutes','Seconds'], function(moment)
            {
                var n = (n = now['get' + moment]()) < 10 ? '0' + n : n;
                time.push(n);
            });
            time = [time.join(':')];
            var ms = (ms = now.getMilliseconds()) < 10 ? '00' + ms : ms < 100 ? '0' + ms : ms;
            time.push(ms);
            time = time.join('.');

            //begin compiling the output with a spaced timestamp
            var str = space(time, 16);

            //convert the data to an array if necessary
            if(!(data instanceof Array))
            {
                data = [data];
            }

            //now iterate through the data
            etc.each(data, function(value)
            {
                //the first member is the actual value and the second is the output length
                var len = value[1];
                value = value[0];

                //if the value is a number then limit its precision
                if(typeof value == 'number')
                {
                    value = Math.round(value * 100) / 100;
                }

                //then add the value to the output with the specified spacing
                str += space(value, len);
            });

            //if tags are specified, wrap them around the output
            if(tags)
            {
                str = tags[0] + str + tags[1];
            }
        }

        //else [if data is not defined] then we're just creating a line-break
        else
        {
            str = '';
        }

        //add the final output to the log with a trailing line-break
        thislog.innerHTML += str + '<br>';

        //auto-scroll the log to the bottom if autoscroll is enabled
        if(thislog.getAttribute('data-filter-autoscroll'))
        {
            thislog.scrollTop = thislog.offsetHeight + thislog.scrollHeight;
        }
    }
    //buffer data helper
    function getbuffer(media)
    {
        var buffer = getBufferData(media);
        for(var i = 0; i < buffer.length; i ++)
        {
            buffer[i] = '[' + buffer[i].join(',') + ']';
        }
        return '[' + buffer.join(', ') + ']';
    }
    //video logging calls
    function doVideoLogging(player)
    {
        //media info
        if($this.logs.video)
        {
            window.setLogSizes();

            videolog([
                ['VIDEO-OBJECT', 18],
                ['&lt;' + player.wrapper.nodeName.toLowerCase() + '&gt;', 0]
                ],
                ['<dfn>','</dfn>']);
            videolog([
                ['VIDEO-MODE', 18],
                [player.mode, 0]
                ],
                ['<dfn>','</dfn>']);
            videolog([
                ['VIDEO-TYPE', 18],
                [player.videoType.replace('video/',''), 0]
                ],
                ['<dfn>','</dfn>']);
            videolog([
                ['VIDEO-PRELOAD', 18],
                [player.video.getAttribute('preload'), 0]
                ],
                ['<dfn>','</dfn>']);
            videolog();
        }
        //playback events
        if($this.logs.video)
        {
            etc.each(['seeking','seeked'], function(type)
            {
                etc.listen(player.media, type, function(e)
                {
                    videolog([
                        [e.type.toUpperCase(), 18],
                        [(etc.def(player.media.readyState) ? player.media.readyState : '?') + '/' + (etc.def(player.media.networkState, null) ? player.media.networkState : '?'), 7],
                        [player.media.duration, 10],
                        [player.media.currentTime, 10],
                        ['', 5],
                        [getbuffer(player.media), 0]
                        ],
                        ['<i>','</i>']);
                });
            });
            etc.each(['play','playing','pause','ended'], function(type)
            {
                etc.listen(player.media, type, function(e)
                {
                    videolog([
                        [e.type.toUpperCase(), 18],
                        [(etc.def(player.media.readyState) ? player.media.readyState : '?') + '/' + (etc.def(player.media.networkState, null) ? player.media.networkState : '?'), 7],
                        [player.media.duration, 10],
                        [player.media.currentTime, 10]
                        ],
                        ['<ins>','</ins>']);
                });
            });
        }
        //loading and buffering info
        if($this.logs.video)
        {
            etc.each(['loadstart','loadedmetadata'], function(type)
            {
                etc.listen(player.media, type, function(e)
                {
                    videolog([
                        [e.type.toUpperCase(), 18],
                        [(etc.def(player.media.readyState) ? player.media.readyState : '?') + '/' + (etc.def(player.media.networkState, null) ? player.media.networkState : '?'), 7],
                        [player.media.duration, 10],
                        [player.media.currentTime, 10],
                        ['', 5],
                        [getbuffer(player.media), 0]
                        ]);
                });
            });
            etc.listen(player.media, 'waiting', function(e)
            {
                videolog([
                    [e.type.toUpperCase(), 18],
                    [(etc.def(player.media.readyState) ? player.media.readyState : '?') + '/' + (etc.def(player.media.networkState, null) ? player.media.networkState : '?'), 7],
                    [player.media.duration, 10],
                    [player.media.currentTime, 10],
                    ['', 5],
                    [getbuffer(player.media), 0]
                    ],
                    ['<b>','</b>']);
            });
            etc.listen(player.media, 'canplay', function(e)
            {
                videolog([
                    [e.type.toUpperCase(), 18],
                    [(etc.def(player.media.readyState) ? player.media.readyState : '?') + '/' + (etc.def(player.media.networkState, null) ? player.media.networkState : '?'), 7],
                    [player.media.duration, 10],
                    [player.media.currentTime, 10],
                    ['', 5],
                    [getbuffer(player.media), 0]
                    ],
                    ['<u>','</u>']);
            });
            etc.listen(player.media, 'error', function(e)
            {
                videolog([
                    [e.type.toUpperCase(), 18],
                    [(etc.def(player.media.readyState) ? player.media.readyState : '?') + '/' + (etc.def(player.media.networkState, null) ? player.media.networkState : '?'), 7],
                    [player.media.duration, 10],
                    [player.media.currentTime, 0]
                    ],
                    ['<b><b>','</b></b>']);
            });
            etc.each(['progress'], function(type)
            {
                etc.listen(player.media, type, function(e)
                {
                    if($this.logs.video.getAttribute('data-filter-progress'))
                    {
                        videolog([
                            [e.type.toUpperCase(), 18],
                            [(etc.def(player.media.readyState) ? player.media.readyState : '?') + '/' + (etc.def(player.media.networkState, null) ? player.media.networkState : '?'), 7],
                            [player.media.duration, 10],
                            [player.media.currentTime, 10],
                            //[isTimeBuffered(player.media) ? '<strong> Y </strong>' : '<small> N </small>', 5],
                            ['',5],
                            [getbuffer(player.media), 0]
                            ],
                            ['<tt>','</tt>']);
                    }
                });
            });
            etc.each(['timeupdate'], function(type)
            {
                etc.listen(player.media, type, function(e)
                {
                    if($this.logs.video.getAttribute('data-filter-timeupdate'))
                    {
                        videolog([
                            [e.type.toUpperCase(), 18],
                            [(etc.def(player.media.readyState) ? player.media.readyState : '?') + '/' + (etc.def(player.media.networkState, null) ? player.media.networkState : '?'), 7],
                            [player.media.duration, 10],
                            [player.media.currentTime, 10],
                            //[isTimeBuffered(player.media) ? '<strong> Y </strong>' : '<small> N </small>', 5],
                            ['',5],
                            [getbuffer(player.media), 0]
                            ],
                            ['<del>','</del>']);
                    }
                });
            });
        }
    }
    //audio logging calls
    function doAudioLogging(player)
    {
        //media info
        if($this.logs.audio)
        {
            window.setLogSizes();

            audiolog([
                ['AUDIO-OBJECT', 18],
                ['&lt;' + player.audio.nodeName.toLowerCase() + '&gt;', 0]
                ],
                ['<dfn>','</dfn>']);
            audiolog([
                ['AUDIO-TYPE', 18],
                [player.instance.audioType.replace('video/',''), 0]
                ],
                ['<dfn>','</dfn>']);
            audiolog([
                ['AUDIO-PRELOAD', 18],
                [player.audio.getAttribute('preload'), 0]
                ],
                ['<dfn>','</dfn>']);
            audiolog();
        }
        //playback events
        if($this.logs.audio)
        {
            etc.each(['seeking','seeked'], function(type)
            {
                etc.listen(player.audio, type, function(e)
                {
                    if(player.audio)
                    {
                        audiolog([
                            [e.type.toUpperCase(), 18],
                            [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                            [player.audio.duration, 10],
                            [player.audio.currentTime, 10]
                            ],
                            ['<i>','</i>']);
                    }
                });
            });
            etc.each(['volumechange'], function(type)
            {
                etc.listen(player.audio, type, function(e)
                {
                    if(player.audio)
                    {
                        audiolog([
                            [e.type.toUpperCase(), 18],
                            [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                            [player.audio.duration, 10],
                            [player.audio.currentTime, 10],
                            ['', 5],
                            [player.audio.volume + ' [' + player.audio.muted + ']', 0]
                            ],
                            ['<i>','</i>']);
                    }
                });
            });
            etc.each(['play','playing','pause','ended'], function(type)
            {
                etc.listen(player.audio, type, function(e)
                {
                    if(player.audio)
                    {
                        audiolog([
                            [e.type.toUpperCase(), 18],
                            [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                            [player.audio.duration, 10],
                            [player.audio.currentTime, 10]
                            ],
                            ['<ins>','</ins>']);
                    }
                });
            });
        }
        //loading and buffering info
        if($this.logs.audio)
        {
            etc.each(['loadstart','loadedmetadata'], function(type)
            {
                etc.listen(player.audio, type, function(e)
                {
                    if(player.audio)
                    {
                        audiolog([
                            [e.type.toUpperCase(), 18],
                            [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                            [player.audio.duration, 10],
                            [player.audio.currentTime, 10],
                            ['', 5],
                            [getbuffer(player.audio), 0]
                            ]);
                    }
                });
            });
            etc.listen(player.audio, 'waiting', function(e)
            {
                if(player.audio)
                {
                    audiolog([
                        [e.type.toUpperCase(), 18],
                        [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                        [player.audio.duration, 10],
                        [player.audio.currentTime, 10],
                        ['', 5],
                        [getbuffer(player.audio), 0]
                        ],
                        ['<b>','</b>']);
                }
            });
            etc.listen(player.audio, 'canplay', function(e)
            {
                if(player.audio)
                {
                    audiolog([
                        [e.type.toUpperCase(), 18],
                        [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                        [player.audio.duration, 10],
                        [player.audio.currentTime, 10],
                        ['', 5],
                        [getbuffer(player.audio), 0]
                        ],
                        ['<u>','</u>']);
                }
            });
            etc.listen(player.audio, 'error', function(e)
            {
                if(player.audio)
                {
                    audiolog([
                        [e.type.toUpperCase(), 18],
                        [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                        [player.audio.duration, 10],
                        [player.audio.currentTime, 0]
                        ],
                        ['<b><b>','</b></b>']);
                }
            });
            etc.each(['progress'], function(type)
            {
                etc.listen(player.audio, type, function(e)
                {
                    if(player.audio)
                    {
                        if($this.logs.audio.getAttribute('data-filter-progress'))
                        {
                            audiolog([
                                [e.type.toUpperCase(), 18],
                                [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                                [player.audio.duration, 10],
                                [player.audio.currentTime, 10],
                                //[isTimeBuffered(player.audio) ? '<strong> Y </strong>' : '<small> N </small>', 5],
                                ['',5],
                                [getbuffer(player.audio), 0]
                                ],
                                ['<tt>','</tt>']);
                        }
                    }
                });
            });
            etc.each(['timeupdate'], function(type)
            {
                etc.listen(player.audio, type, function(e)
                {
                    if($this.logs.audio.getAttribute('data-filter-timeupdate'))
                    {
                        if(player.audio)
                        {
                            audiolog([
                                [e.type.toUpperCase(), 18],
                                [(etc.def(player.audio.readyState) ? player.audio.readyState : '?') + '/' + (etc.def(player.audio.networkState) ? player.audio.networkState : '?'), 7],
                                [player.audio.duration, 10],
                                [player.audio.currentTime, 10],
                                //[isTimeBuffered(player.audio) ? '<strong> Y </strong>' : '<small> N </small>', 5],
                                ['',5],
                                [getbuffer(player.audio), 0]
                                ],
                                ['<del>','</del>']);
                        }
                    }
                });
            });
        }
    } */







    //-- private => interface functions --//

    //add the player interface and media events for a player instance
    //nb. this is triggered by the MediaElement success function
    function addMediaInterface(player)
    {
        //get a reference to the media wrapper element
        //which might be an <iframe>, flash replacement object,
        //or <video> replacement object depending on the ME renderer
        //but in all cases is referenced by the player.media object
        //nb. this reference is entirely redundant now, it's a hangover from ME2
        //when it would be only be a replacement element for flash or youtube
        //but ME4 always creates a replacement element, even for native
        //might convert the references at some point, but it doesn't matter
        player.wrapper = player.media;

        //jic the wrapper element isn't defined, show the console warning
        //with the player media failure, which returns false for failure
        //and subsequently resets the types and mode and calls abandonMedia
        //(although there are no longer any known circumstances of this, but jic)
        //also do this if there's no rendererName, which can happen if the player
        //tries to use a flash shim when the user doesn't have flash installed
        //or can't support a JavaScript shim (like with MPEG-DASH in iOS)
        //or uses optional third-party media without including its script
        //also most third-party sources are not supported for the audio-only player
        //nb. you can use actually native video in the audio-only player
        //and it will still the play the audio track of the video file
        if
        (
            !player.wrapper
            ||
            !player.wrapper.rendererName
            ||
            (
                player.isaudio
                &&
                library.isThirdPartyMedia(player.mode)
            )
        )
        {
            //nb. if we have no media sources at all then videoType will be null
            //whereas if the browser can't use the type nor the replacement shim
            //then videoType will still have the value of the original type
            //but I'm not sure that it's really worth separate warnings
            //since the former type is never gonna happen in production
            //it would only happen due to author testing or obvious mistakes
            return etc.console(etc.sprintf(config.lang['wrapper-failure']), 'warn');
        }


        //if the wrapper doesn't have an ID, then assign one now
        //using the wrapper ID template parsed with the instance ID
        //nb. this is needed to create a fragment-ID action for the form
        if(!player.wrapper.id)
        {
            player.wrapper.id = etc.sprintf(config.ids['video'],
            {
                id : player.instance.id
            });
        }

        //for facebook video, the sizing method doesn't work
        //but it does respond to changes in the container width
        //so we can resize the video by setting the container width
        //nb. setting the height doesn't affect it, the video always
        //sizes itself according to its own aspect ratio, so if we set a
        //non-matching height we'll just get black space under the controls
        //*** how will that work for portrait videos?
        //*** the height is too large with black space on iOS/Android
        if(player.mode == 'facebook')
        {
            player.container.style.width = player.video.getAttribute('width') + 'px';
        }


        //set negative tabindex on the video to remove it from the tab order
        //and the same for the plugin embed, object, or iframe, as defined
        //(if an iframe is present it will be the wrapper element itself)
        //nb. use the property name to avoid cross-browser discrepancies
        //because setAttribute('tabindex') doesn't work in legacy IE, but
        //setAttribute('tabIndex') is an entirely different attribute in others
        player.video.tabIndex = '-1';
        if(player.mode != 'native')
        {
            (
                etc.get('embed', player.wrapper)[0]
                ||
                etc.get('object', player.wrapper)[0]
                ||
                player.wrapper

            ).tabIndex = '-1';
        }

        //now remove any fallback content else the flash player will show both
        //and if we've got this far then we know we don't need it
        etc.each(etc.get('*', player.container), function(node)
        {
            if(etc.hasClass(node, config.classes['fallback']))
            {
                etc.remove(node);
                return false;
            }
        });

        //*** DEV TMP
        //if(__.console) { console.log(etc.dump(player)); }
        //if(__.console) { console.log(player); }


        //nb. the order in which we create and add content to the player
        //is important, because it determines the reading order, both
        //for assistive technologies, and when viewing without CSS

        //if this is not an audio-only player
        //create a custom poster overlay to shore-up the
        //native poster, and to provide an iconic click-to-play
        //nb. if we exclude the browser then this will be null,
        //but if we don't have a poster attribute we still create
        //a blank one, so that we can have the click-to-play icon
        if(!player.isaudio)
        {
            player.poster = addPoster(player);
        }

        //create a container for any captions we might have
        //(which is before the controls form in the reading order)
        //including the disabled state by default, so that the
        //container is hidden until we know we can load the data
        //the container also has a "data-cue" attribute, which is
        //empty string by default and when no caption is displayed
        //else it matches the cue id of the currently displayed caption
        //and is defined as an attribute rather than a property
        //so it can also be used in CSS attribute selectors
        //also make this a polite aria-live region, so that the
        //captions are announced by screenreaders but do not interrupt
        //any interface or interaction speech; this will allow
        //screenreader users to get the benefit of captions
        //(e.g. for translations or non-native english speakers)
        //although some users might not want them since they can
        //hear the audio anyway, but they can always turn them off
        //whereas not making them live would exclude them from these users
        player.captions = etc.build('div',
        {
            '=parent'       : player.container,
            'class'         : config.classes['captions']
                            + ' '
                            + config.classes['state-disabled'],
            'data-cue'      : '',
            'aria-live'     : 'polite',
            'aria-atomic'   : 'true',
            'aria-relevant' : 'additions text'
        });


        //now create a tracks object with null default members
        player.tracks =
        {
            descriptions        : null,     //text descriptions (for future use)
            youtube_captions    : null,     //youtube embedded captions
            vimeo_captions      : null,     //vimeo embedded captions
            vimeo_captions_lang : null,     //vimeo embedded captions
            captions            : null,     //track captions
            transcript          : null,     //track transcript data
            xad                 : null      //track xad metadata
        };

        //if this is a youtube video then check the source element
        //for a data-captions attribute, which denotes the presence of
        //overriding embedded captions and controls their default enabled state
        //treating them as enabled by default unless the attribute value is false
        //however for vimeo we need a language code to turn captions on and off
        //so we'll also have to check for an srclang, or default to "en" for simplicity
        //and do this even if data-captions isn't present so we can use them on the iphone
        //and define it in a separate member so we can still test for !vimeo_captions
        //nb. if multiple sources are present then the player uses the first one anyway
        if(player.mode == 'youtube' || player.mode == 'vimeo')
        {
            var source = etc.get('source', player.container)[0];
            if(source)
            {
                var attr = source.getAttribute('data-captions');
                if(attr !== null)
                {
                    player.tracks[player.mode + '_captions'] =
                    {
                        enabled : attr != 'false'
                    };
                }
                if(player.mode == 'vimeo')
                {
                    player.tracks.vimeo_captions_lang = source.getAttribute('data-captions-srclang') || 'en';
                }
            }
        }

        //then if we don't have overriding youtube or vimeo captions
        //define the captions and transcript members by looking in the player
        //for text tracks with corresponding data, and that will return either
        //an object of the tracks data, or null if there aren't any
        //nb. don't bother if we've already defined embedded youtube captions
        //and also don't bother looking for transcript data if we don't have a transcript container
        //since the data will never be used we can save ourselves the overhead
        if(!player.tracks.youtube_captions && !player.tracks.vimeo_captions)
        {
            player.tracks.captions = getTracksData(player, 'captions');
            if(player.transcript)
            {
                player.tracks.transcript = getTracksData(player, 'transcript');
            }
        }

        //*** DEV TMP
        //if(player.tracks.captions && etc.def(player.video.textTracks))
        //{
        //    var str = '#' + player.instance.id + '\nenabled = ' + player.tracks.captions.enabled + '\n' + 'selected captions = "' + player.tracks.captions.selected.captions + '"\n' + 'selected transcript = "' + player.tracks.captions.selected.captions + '"\n' + 'modes\n';
        //    etc.each(player.video.textTracks, function(track) { str += '"' + track.language + '" = "' + track.mode + '"\n'; });
        //    console.log(str);
        //}

        //then if we have any captions tracks data, and either they're
        //enabled by default or the transcript container is present
        //nb. if there's transcript data but no captions data, the transcript
        //data won't show on it's own, it can only be combined with captions data
        if(player.tracks.captions && (player.tracks.captions.enabled || player.transcript))
        {
            //then try to load the selected transcript data straight away
            //which will also generate the transcript if we have the container
            //nb. if they fail to load then we disable and update the cc button
            //and show a failure message in the button title and transcript container
            loadTracksData(player, player.tracks.captions.selected.transcript);
        }

        //if this is ios then assume that we always have youtube or vimeo captions
        //so its fullscreen player can use them when everyone else uses local ones
        //while simultaneously generating the transcript from those local ones
        //set the default enabled state to match the state of local captions
        //for which we may have to define the original object if it wasn't defined
        //nb. youtube won't throw any errors if there are no embedded captions
        //they'll simply be shown if they exist and nothing if they don't
        //however vimeo will throw errors if we try to load captions in a language that
        //isn't defined, so we'll have to catch that, and disable the CC button if necessary
        if(defs.agent.ios && player.tracks.captions && (player.mode == 'youtube' || player.mode == 'vimeo'))
        {
            (player.tracks[player.mode + '_captions'] = player.tracks[player.mode + '_captions'] || {}).enabled
                = player.tracks.captions.enabled;
        }

        //*** DEV TMP
        //console.warn('player.tracks');
        //console.dir(player.tracks);


        //if we have audio descriptions, look for xad track data
        if(player.audiodesk)
        {
            if(player.tracks.xad = getTracksData(player, 'xad'))
            {
                //if this is not html5 then xad is not supported because
                //the third-party APIs don't support setting playbackrate to 0
                //and playing the AD normally would be pointless since they'd be out of sync
                //so we set the ad error state the same as if the data had failed to load
                //also there's no point trying to support it for flash video
                //since the only possible browser that could support native
                //audio but not native video is old Firefox when the video is mp4
                //so ultimately, we only support it with standard mp4/webm video
                if(player.media.rendererName != 'html5')
                {
                    //set the xad tracks data to null
                    player.tracks.xad = null;

                    //nullify the player audio reference so we don't keep
                    //trying to play and pause it, or keep having to
                    //test its readyState to see if we can synchronise
                    //we can also use this to detect existing failure
                    //when we build the form in just a moment
                    player.audio = null;
                }

                //else [for a regular video] try to load the xad data
                else
                {
                    loadXADTrackData(player);
                }
            }
        }


        //create an indicator overlay which covers the entire interface
        //which is hidden by default with offleft positioning
        //and positioned on top of everything except the controls
        //also define a timer reference we'll use for animating the
        //loading sprites, plus an inner strong to hold the image
        //then after the strong is an inner span that's used as a
        //transclucent layer since not all browsers support RGBA
        //and inside the strong is an em element, which has aria-live
        //persistent but off-left positioning, and which will have
        //a status message written into it when the indicator is shown
        //then removed again when the indicator is hidden, for status info
        //we also need an icontype property to record what type of indicator it is
        //so that we can show different icons for "loading" or "timeout"
        //nb. and because it is status info, I think it would be best
        //if it's before the video in the source order, so that logically
        //and visually it's after any video caption but before any content
        //this is also why it's a <p> rather than just a <div>
        //nb. these aria-live settings are the default anyway, but jic
        player.indicator = etc.build('p',
        {
            '=before'                   : player.wrapper,
            'class'                     : config.classes['indicator'],
            '.timer'                    : null,
            '.icontype'                 : null,
            '#dom'                      :
            [
                etc.build('strong',
                {
                    '#dom'              : etc.build('em',
                    {
                        'aria-live'     : 'assertive',
                        'aria-relevant' : 'additions text'
                    })
                }),
                etc.build('span')
            ]
        });

        //apply the loading class but keep it hidden, then pause momentarily
        //and remove the class again, which has the effect of caching
        //the background sprites so there's no pause before they appear
        //nb. but we can't do this for the large sprites without making the container large
        //I suppose we could have an extra caching class, but I don't think it's worth it
        //nb. we don't need to cache the timeout icon because it's part of
        //the overlays image, which is used in the default poster overlay
        etc.addClass(player.indicator, config.classes['indicator-loading']);
        etc.delay(100, function()
        {
            etc.removeClass(player.indicator, config.classes['indicator-loading']);
        });



        /*** DEV LOG ***//*
        doVideoLogging(player);
        if(player.audio) { doAudioLogging(player); } */


        //~~ controls ~~//

        //*** DEV TMP DELAY SO LOAD IS BEFORE FORM ADDITION
        //etc.delay(2000, function() {

        //keep a record of all the buttons we add (recording each key)
        //which we'll need to calculate the total space they take up
        //so we can apply dynamic widths to the seek and volume fields
        //and since we now have two rows, we need two separate collections
        //indexed by the node reference of the row relative to the controlform
        player.buttonkeys = { firstChild : [], lastChild : [] };

        //create the controls form inside the container
        //including an action that points to the media wrapper ID
        //(which is better semantics than using javascript:void(null))
        //so then we need an onsubmit event to block native submission and bubbling
        //which is all we need as long as the form has no submit button
        //also add a pinned property which controls whether autohiding should be
        //honoured (false) or should be ignored in favour of user settings (true)
        //nb. originally we had to set a style.width for the benefit of IE6
        //but now the specified width is something other browsers rely on
        //nb. the form has no padding, margin or borders, so that
        //we can size it without any added box-model complications
        //nb. originally this had aria-controls pointing to the media wrapper ID
        //however aria-controls is not well implemented among screenreaders
        //and created confusing interaction prompts as a results, eg. in JAWS + Firefox
        //the prompt to "Press JAWS key plus Alt plus M to move to controlled element"
        //which then always resulted in the message "Failed to move to controlled element"
        //nb. we have to add role=form here to fix a nonsensical bug with JAWS, whereby
        //the Play button wasn't being announced at all when navigating using "f"
        //and either wasn't announced, or was announced without its toggle state,
        //when navigating using Tab, and in both cases failed to work when actuated
        //furthermore the time slider had a similar problem, whereby it wasn't always
        //being announced when navigated to via Tab or the "f" key, only sometimes
        //there's nothing in the markup of those controls that suggested a problem,
        //and the problem has only recently manifested (between 3.1 and 3.2) yet none
        //of the intermediate changes to the script appeared to have any relationship
        //and all of the other buttons and controls within the form worked just fine
        //the only tangible thing was that when moving the controls to a different place
        //(eg. between the CC and AD buttons) the button and slider then worked fine
        //so eventually this article gave a clue: https://tink.uk/jaws-ie-the-forms-region-bug/
        //even though the issue in that article is unrelated, it gave a clue to a potential fix
        //which, wouldn't you know, turned out to work and solve the problem completely!
        //after several days of headscratching, that was quite a relief I can tell you :-)
        //nb. the pinned property is for the benefit of Android TalkBack, which can't
        //easily navigate to the controls when they're visually hidden; the true setting
        //will prevent them from ever being visually hidden, and true is later set as the
        //default when we create the pin button, since the benefit may not be immediately
        //clear to users but the lack of it is definitely noticeable, so it's safer
        //to assume that we shouldn't hide the controls unless users change this setting
        //the setting itself persists like volume, so they don't have to do it every time
        player.controlform = etc.build('form',
        {
            'class'         : config.classes['controls'],
            'action'        : '#' + player.wrapper.id,
            'role'          : 'form',
            'onsubmit'      : function(){ return null },
            '.pinned'       : false,
            '#style'        :
            {
                'width'     : player.wrapper.offsetWidth + 'px'
            },
            '#dom'          : etc.build('fieldset')
        });

        //if we're using the audio-only player
        if(player.isaudio)
        {
            //if the audio element has a data-width attribute which is validly
            //defined, then use that value to set a width on the controlform,
            //otherwise use the default width from config; which we have to do
            //else it will have no width, since there's no video to stretch it
            var w = player.video.getAttribute('data-width');
            if(!w || isNaN(w = parseInt(w, 10)))
            {
                w = config['default-width'];
            }
            player.controlform.style.width = w + 'px';
        }

        //then append the control form to the container,
        //for all except iphones, or for ipads when the player mode is vimeo
        //nb. we don't need the controls for iphones or ipad/vimeo
        //so we can save the rendering overhead of appending the controls at all
        //but we do still need to create them so that their references don't break
        //(and it's not worth the time and code to refactor the assumption of their presence)
        //nb. we don't except android or ipad/native because they don't have the same behavior
        //they embed the video for playback in the page, like a normal desktop browser
        //we also don't do except the audio-only player, which always has custom controls
        //nb. we have to insert this before the captions, not append after it,
        //on order to fix a weird bug that occurs in JAWS: whereby using
        //the quick form key "f" while the video is playing moves between
        //the form controls in an apparently random order, rather than sequentially
        //which doesn't occur when the video is not playing, and turned out to
        //be triggered by changes in the captions: it doesn't happen when
        //captions are switched off, or when they're overriden so that every
        //caption value is the same, and it does still happen when the live
        //region is removed from it, so it must be related to the continual
        //changes in the DOM; however if we move the captions container here
        //then the problem also no longer occurs, so it must be further be
        //related to changes in the DOM that occur before the current context.
        //nnb. although this is not the ideal DOM structure, since the captions
        //are visually before the controls but structurally come after them
        //however I think that's a small price to pay for fixing this bug
        if
        (
            player.isaudio
            ||
            !defs.agent.ios
            ||
            (defs.agent.ios && !defs.agent.iphone && player.mode != 'vimeo')
        )
        {
            player.controlform = player.container.insertBefore(player.controlform, player.captions);
        }

        //else if this is one of those phones [and we're not appending the control form]
        //make any other adjustments we need to allow for the difference
        else
        {
            //disable auto-hiding so we don't waste work on that
            config['auto-hiding-delay'] = 0;
        }


        //if this is iOS or Android with third-party media, force the
        //controls to be "row", because we can't allow the auto-hiding events,
        //since the auto-show is controlled by touches, but we won't get
        //those events from third-party plugins, presumably because the events
        //go through to the embedded iframe document, but if we just disabled
        //the auto-hiding then you'd lose the bottom 32px of the picture
        //so I think the best thing is to force the layout to be "row"
        //then there are no auto-hiding events and you get the full picture
        //nb. this isn't necessary for the iphone since it doesn't have the
        //custom controls anyway, but it's not worth the extra condition
        if((defs.agent.ios || defs.agent.android) && library.isThirdPartyMedia(player.mode))
        {
            player.options.controls = 'row';
        }

        //then if the controls option is "stack", add the container stack-controls class
        if(player.options.controls == 'stack')
        {
            etc.addClass(player.container, config.classes['stack-controls']);
        }

        //for reasons I can't really fathom, whichever media "play" event
        //is the first one to be bound doesn't fire on initial playback
        //you have to play, then pause, then play again before it fires
        //while all other play events are fine, it's just the first one
        //and since the auto-hiding play event is the first one we bind
        //auto-hiding won't happen at all when you initially play the video
        //like wtf is that? what could it possibly be? I really have nfi
        //maybe ME does some kind of JIT event management or some shit, idfk
        //anyway, we can workaround that by creating an empty one first
        //which won't fire the first time, obvs, but that doesn't matter
        etc.listen(player.media, 'play', function(){});

        //now start the auto-hiding process, which maintains the container auto-hiding
        //and auto-hidden classes, and monitors user interaction events to add and remove them
        //so that while the video is playing we can hide the controls and adjust the
        //caption position if stack controls are in use, and hide the skip links either way
        startAutoHiding(player);


        //detect whether range inputs are supported, so we know what input type
        //to use for the sliders' underlying controls, using "range" if supported
        //which renders as a slider when CSS is not available, or "hidden" if not
        //so you don't see a text field, since the value would be in seconds,
        //and is effectively impossible to manually change while the video is playing
        var slidertype = etc.build('input', { 'type' : 'range' }).type == 'range' ? 'range' : 'hidden';


        //create a span-wrapped rewind button inside the first fieldset
        //with its state set to "off" and the button disabled by default
        //nb. the open-bracket must be on the same line for function name compression
        addControlButton(
            player,
            player.controlform.firstChild,
            'rewind',
            false,
            'off',
            'off',
            {
                //then define an abstraction for the button's command handler
                //so we can call it programatically (eg. from the global key handler)
                '.ozcommand'  : function()
                {
                    //*** DEV TMP
                    //if(__.console) { console.log('player.controlform.rewind.ozcommand()'); }

                    //get the media's currentTime and subtract the config seek duration
                    //then pass the new value straight to setMediaTime
                    //nb. we don't need to worry about out-of-range values because setMediaTime
                    //takes of that; we also don't need to worry about the updating the seek slider,
                    //because setting the media time will cause a reciprocal timeupdate
                    //event to be fired, which in turn will update theslider and its input
                    setMediaTime(player, Math.floor(player.media.currentTime - config['seek-duration']));

                    //then set the ended flag to false, so that if you play to the end
                    //then seek to an earlier point, it will carry on playing from there
                    player.ended = false;

                    //if we have xad data and an xad cue is currently playing
                    //nb. there's no need to check the ready states
                    //of the audio and xad data, because the playing flag
                    //wouldn't be true unless all of that was already checked
                    if(player.tracks.xad && player.audiodesk.xad.playing)
                    {
                        //stop any playing xad audio and reset xad tracking
                        //setting lastcue to null so it can be selected again
                        xadReset(player, null);

                        //*** DEV TMP
                        //console.error('REWIND-RESET\n'
                        //    + '\nplaying   = ' + player.audiodesk.xad.playing
                        //    + '\nactivecue = ' + (player.audiodesk.xad.activecue ? ('["' + player.audiodesk.xad.activecue.id + '"]') : 'NULL')
                        //    + '\nlastcue   = ' + (player.audiodesk.xad.lastcue ? ('["' + player.audiodesk.xad.lastcue.id + '"]') : 'NULL')
                        //    + '');
                    }

                    //*** DEV TMP
                    //if(__.console) { console.log('rewind(' + Math.floor(player.media.currentTime) + ' => ' + Math.floor(player.media.currentTime - config['seek-duration']) +')'); }
                }
            }
        );

        //update the button's aria-label and text parsed with the seek duration
        //nb. this process may trigger updateSliderStretch, but we haven't
        //built all the sliders and spacer yet so that would cause an error,
        //so pass the explicit noupdate flag to prevent that from happening
        updateControlText(player, 'rewind',
            etc.sprintf(getLang(player, 'button-rewind-off'), { '2' : config['seek-duration'] }),
            etc.sprintf(getLang(player, 'text-rewind-off'), { '2' : config['seek-duration'] }),
            true
            );

        //bind the button's click handler to its command abstraction
        //which we have to do separately since we can't rely on the order of
        //iteration through the properties object passed to the build function
        //nb. since this is a proper button, it will work for touch and keyboard
        addControlClick(player, 'rewind');

        //then add it to the firstChild buttonkeys
        player.buttonkeys.firstChild.push('rewind');


        //create a span-wrapped forward button inside the first fieldset
        //with its state set to "off" and the button disabled by default
        //nb. the open-bracket must be on the same line for function name compression
        addControlButton(
            player,
            player.controlform.firstChild,
            'forward',
            false,
            'off',
            'off',
            {
                //then define an abstraction for the button's command handler
                //so we can call it programatically (eg. from the global key handler)
                '.ozcommand'  : function()
                {
                    //*** DEV TMP
                    //if(__.console) { console.log('player.controlform.forward.ozcommand()'); }

                    //get the media's currentTime and add the config seek duration
                    //then pass the new value straight to setMediaTime
                    //nb. we don't need to worry about out-of-range values because setMediaTime
                    //takes of that; we also don't need to worry about the updating the seek slider,
                    //because setting the media time will cause a reciprocal timeupdate
                    //event to be fired, which in turn will update theslider and its input
                    setMediaTime(player, Math.floor(player.media.currentTime + config['seek-duration']));

                    //if we have xad data and an xad cue is currently playing
                    //nb. there's no need to check the ready states
                    //of the audio and xad data, because the playing flag
                    //wouldn't be true unless all of that was already checked
                    if(player.tracks.xad && player.audiodesk.xad.playing)
                    {
                        //stop any playing xad audio and reset xad tracking
                        //setting lastcue to null so it can be selected again
                        xadReset(player, null);

                        //*** DEV TMP
                        //console.error('FORWARD-RESET\n'
                        //    + '\nplaying   = ' + player.audiodesk.xad.playing
                        //    + '\nactivecue = ' + (player.audiodesk.xad.activecue ? ('["' + player.audiodesk.xad.activecue.id + '"]') : 'NULL')
                        //    + '\nlastcue   = ' + (player.audiodesk.xad.lastcue ? ('["' + player.audiodesk.xad.lastcue.id + '"]') : 'NULL')
                        //    + '');
                    }

                    //*** DEV TMP
                    //if(__.console) { console.log('forward(' + Math.floor(player.media.currentTime) + ' => ' + Math.floor(player.media.currentTime + config['seek-duration']) +')'); }
                }
            }
        );

        //update the button's aria-label and text parsed with the seek duration
        //nb. this process may trigger updateSliderStretch, but we haven't
        //built all the sliders and spacer yet so that would cause an error,
        //so pass the explicit noupdate flag to prevent that from happening
        updateControlText(player, 'forward',
            etc.sprintf(getLang(player, 'button-forward-off'), { '2' : config['seek-duration'] }),
            etc.sprintf(getLang(player, 'text-forward-off'), { '2' : config['seek-duration'] }),
            true
            );

        //bind the button's click handler to its command abstraction
        //which we have to do separately since we can't rely on the order of
        //iteration through the properties object passed to the build function
        //nb. since this is a proper button, it will work for touch and keyboard
        addControlClick(player, 'forward');

        //then add it to the firstChild buttonkeys
        player.buttonkeys.firstChild.push('forward');


        //create a span-wrapped seek input inside the first fieldset, of the specified type
        //including the field wrapper classes (but we don't need a state class)
        //plus a default field disabled class and the button disabled attribute
        //defining a name so we can refer to it in the control form collection
        //but also explicitly creating that reference just to be on the safe side
        //and we also have to define an ID because the slider script requires one
        //set the default range from zero to zero, until we know the duration
        //and set the default step to one second, until we know it should be greater
        //as well as defining a timestep property, which is simply a numeric version of that
        //but is easier and more efficient to refer to than parseInt(getAttribute)
        //also define aria-hidden so that screenreaders should ignore it
        //then they'll use the aria data encoded in the custom slider instead
        //(and it also has display:none which should help in that respect)
        //nb. the custom sliders function will add and maintain its title
        //nb. when the max is zero the slider thumb and this input will be disabled
        //and the thumb will be hidden with opacity (so it's invisible but accessible)
        //nb. also add a single space after button, just to create basic spacing
        etc.build('span',
        {
            '=parent'           : player.controlform.firstChild,
            'class'             : config.classes['field-wrapper']
                                + ' '
                                + config.classes['field-seek']
                                + ' '
                                + config.classes['state-disabled'],
            '#dom'              : (player.controlform.seek = etc.build('input',
            {
                'type'          : slidertype,
                'name'          : 'seek',
                'id'            : etc.sprintf(config.ids['slider'],
                {
                    'id'        : player.container.id,
                    'field'     : config.classes['field-seek']
                }),
                'disabled'      : 'disabled',
                'aria-hidden'   : 'true',
                'min'           : '0',
                'max'           : '0',
                'step'          : '1',
                '.timestep'     : 1,
                'value'         : '0',

                //add a mouseup focuser for the benefit of webkit
                //which otherwise doesn't focus the input when you click it
                'onmouseup'     : function(e, thetarget){ if(!thetarget.disabled) { thetarget.focus(); } },

                //also define a seeking flag, that we'll set and clear in the
                //slider event to indicate whether we're currently seeking
                '.seeking'      : false
            })),
            '#text' : ' '
        });


        //now create a second fieldset for the rest of the controls
        etc.build('fieldset', { '=parent' : player.controlform });


        //create a span-wrapped play/pause button inside the second fieldset
        //with its state set to "off" and the button disabled by default
        //nb. the open-bracket must be on the same line for function name compression
        addControlButton(
            player,
            player.controlform.lastChild,
            'playpause',
            false,
            'off',
            'off',
            {
                //then define an abstraction for the button's command handler
                //so we can call it programatically (eg. from the global key handler)
                '.ozcommand'  : function()
                {
                    //*** DEV TMP
                    //if(__.console) { console.log('player.controlform.playpause.ozcommand()'); }

                    //reset the keyclick flag, which is used for the global keyboard shortcuts
                    //see the global keydown and keyup listeners for notes about this
                    player.keyclick = false;

                    //ignore this event if the button is disabled
                    if(player.controlform.playpause.disabled) { return false; }

                    //if the video is already paused
                    //nb. sometimes if you play, pause, then try to play again
                    //all within the first couple of seconds, you might have to click
                    //the play button twice before it registers; but you know what,
                    //I've had it up to here with all the little problems that occur
                    //if press play and pause really quickly at the start, so that'll do!
                    if(player.media.paused)
                    {
                        //if playback has already ended then automatically reset to the start
                        //nb. native implementations would do this anyway if playback ended naturally
                        //but the flash player won't, and neither will native if we
                        //forced the end point by manually seeking to the end
                        //nb. we have this code in both the play event and the playpause
                        //command, to handle native and manual interaction respectively
                        if(player.ended)
                        {
                            //set the playback position back to the start
                            setMediaTime(player, 0);

                            //also reset the seek slider so we don't have to wait for timeupdate
                            //and this will also retrospectively update the seek control
                            dispatchMediaSliderEvent(player.controlform.seek, 0);

                            //if we have a scrolling transcript, reset it to the top
                            if(player.transcript && player.transcript.offsetHeight < player.transcript.scrollHeight)
                            {
                                player.transcript.scrollTop = 0;
                            }

                            //and then reset the player ended flag
                            //nb. but we don't reset the started flag, because that
                            //means the video has never been played, which it has now
                            player.ended = false;
                        }

                        //play the media
                        playMedia(player);

                        //then update the button state
                        updateControlState(player, 'playpause', 'on');
                    }

                    //else if the video is currently playing
                    //nb. we call pause() onended for consistency
                    //so that !paused always means we're playing
                    else
                    {
                        //hide the loading indicator
                        hideIndicator(player);

                        //if we have audio descriptions (whether or not they're enabled)
                        if(player.audio)
                        {
                            //reset set the waiting flag
                            player.audiodesk.waiting = false;

                            /*** DEV LOG (audio wait) ***//*
                            if($this.logs.audio)
                            {
                                audiolog([['AUDIO-WAIT', 18],['',26],['GOOD', 0]],['<dfn>','</dfn>']);
                            } */

                            //then if the audio descriptions are enabled
                            if(player.audiodesk.enabled)
                            {
                                //unmute the audio unless the media is also muted
                                player.audio.muted = player.media.muted;
                            }
                        }

                        //now pause the media
                        pauseMedia(player, true);

                        //then update the button state
                        updateControlState(player, 'playpause', 'off');
                    }
                }
            }
        );

        //bind the button's click handler to its command abstraction
        //which we have to do separately since we can't rely on the order of
        //iteration through the properties object passed to the build function
        //nb. since this is a proper button, it will work for touch and keyboard
        addControlClick(player, 'playpause');

        //then add it to the lastChild buttonkeys
        player.buttonkeys.lastChild.push('playpause');


        //add a spacer element to create a gap before the next group of buttons
        player.controlform.spacer = etc.build('span',
        {
            '=parent'    : player.controlform.lastChild,
            'class'      : config.classes['field-wrapper']
                         + ' '
                         + config.classes['field-spacer']
        });

        //add a cheeky <br> to provide some basic formatting when CSS is unavailable
        //(ie. so the volume button and input are on a line of their own)
        //nb. it would be better to do this with fieldsets, but that's too much
        //complication, as it's much simpler if the controls all have the same parent
        etc.build('br', { '=parent' : player.controlform.lastChild });


        //if we have any captions tracks data or embedded youtube or vimeo captions
        //unless this is an audio-only player and we don't have multiple languages
        //(in which case we don't need the button since there's no language selection)
        if
        (
            player.tracks.youtube_captions
            ||
            player.tracks.vimeo_captions
            ||
            (
                player.tracks.captions
                &&
                !(
                    player.isaudio
                    &&
                    !player.tracks.captions.i18n
                )
            )
        )
        {
            //for embedded youtube or vimeo captions, define the default button state
            //and lang acccording to whether the captions are enabled by default
            if(player.tracks.youtube_captions)
            {
                var
                statekey = player.tracks.youtube_captions.enabled ? 'on' : 'off',
                labelkey = statekey;
            }
            else if(player.tracks.vimeo_captions)
            {
                statekey = player.tracks.vimeo_captions.enabled ? 'on' : 'off';
                labelkey = statekey;
            }

            //or for regular track captions, define the default button state
            //acccording to whether the captions are enabled by default, and
            //the lang applicable to the current captions-selected readyState
            //ie. showing the loading message if it's 2, or the normal state message otherwise
            //nb. we know that the captions-selected flag is not "off" if enabled is true
            else
            {
                statekey = player.tracks.captions.enabled ? 'on' : 'off';
                labelkey = player.tracks.captions.enabled
                         ? (player.tracks.captions[player.tracks.captions.selected.captions].readyState == 2 ? 'loading' : 'on')
                         : 'off';
            }

            //create a span-wrapped cc button inside the second fieldset
            //nb. the open-bracket must be on the same line for function name compression
            addControlButton(
                player,
                player.controlform.lastChild,
                'cc',
                true,
                statekey,
                labelkey,
                {
                    //create an abstraction for loading and displaying the captions
                    //specified by the current caption track captions-selected flag
                    //and updating the transcript specified by transcript-selected flag
                    //when changing language after the initial transcript has loaded
                    '.display' : function()
                    {
                        //if the captions for this language haven't been loaded yet
                        //nb. if the readyState is 2 then we're already mid-loading
                        //whereas 4 means they've already loaded, and 0 means they failed to load
                        //so it's only if the readyState is 1 that we need to do this
                        if(player.tracks.captions[player.tracks.captions.selected.captions].readyState == 1)
                        {
                            //update the button's aria-label and text to show the loading message
                            //including re-applying the slider widths if images are disabled and it's necessary
                            updateControlText(player, 'cc', getLang(player, 'button-cc-loading'), getLang(player, 'text-cc-loading'));

                            //try to load the selected language captions and transcript
                            loadTracksData(player, player.tracks.captions.selected.captions);
                        }

                        //else if they've already loaded (and whether or not the media is playing)
                        else if(player.tracks.captions[player.tracks.captions.selected.captions].readyState == 4)
                        {
                            //update the captions container to match the currentTime
                            //using the cues array defined in the captions-selected language track
                            //nb. we should do this even when paused, because that's what people will expect
                            //ie. that when the video is paused you can still view the captions, and that
                            //turning them on should show the current time's caption, if there is one
                            displayCaption(player, player.media.currentTime);

                            //if we have multiple languages
                            if(player.tracks.captions.i18n)
                            {
                                //update the button state to "on"
                                updateControlState(player, 'cc', 'on');

                                //update the button's aria-label and text with the language-specific text
                                //converting the text language code to uppercase so it's visually different from "off"
                                //(and because it's an initialism, although ATs will read the aria-label anyway)
                                //including re-applying the slider widths if images are disabled and it's necessary
                                updateControlText(player, 'cc',
                                    etc.sprintf(getLang(player, 'button-cc-lang'), { '1' : player.tracks.captions[player.tracks.captions.selected.captions].label }),
                                    etc.sprintf(getLang(player, 'text-cc-lang'), { '1' : player.tracks.captions.selected.captions.toUpperCase() })
                                    );

                                //if we have a transcript
                                if(player.transcript)
                                {
                                    //add the loading message to overwrite any existing content
                                    //nb. the process of compiling the transcript will generaly be so quick
                                    //that this message won't even be seen, but it's possible that the transcript
                                    //data is very large or that the CPU load is very heaving at the moment
                                    //so we need to have a message just in case it takes longer than usual
                                    etc.appendHTML(player.transcript, '<p><em>' + getLang(player, 'transcript-loading') + '</em></p>', true);

                                    //if we have no additional transcript data, or none which matches the
                                    //specified language code, or we've already tried and failed to load that data
                                    //(when using multiple languages) compile the transcript now with just the captions cues
                                    if
                                    (
                                        player.tracks.transcript === null
                                        ||
                                        !etc.def(player.tracks.transcript[player.tracks.captions.selected.transcript])
                                        ||
                                        player.tracks.transcript[player.tracks.captions.selected.transcript].readyState == 0
                                    )
                                    {
                                        addTranscriptHTML(player, player.tracks.captions[player.tracks.captions.selected.transcript].cues);
                                    }

                                    //else [if we do have matching transcript data]
                                    else
                                    {
                                        //concat the captions cues and transcript cues arrays together
                                        //then sort the resulting array numerically by startTime
                                        var allcues = player.tracks.captions[player.tracks.captions.selected.transcript].cues.concat(player.tracks.transcript[player.tracks.captions.selected.transcript].cues);
                                        allcues.sort(function(a, b)
                                        {
                                            return a.startTime - b.startTime;
                                        });

                                        //and finally compile the transcript with the sorted combined array
                                        addTranscriptHTML(player, allcues);
                                    }
                                }
                            }
                        }
                    },

                    //then define an abstraction for the button's command handler
                    '.ozcommand'  : function()
                    {
                        //reset the keyclick flag
                        player.keyclick = false;

                        //ignore this event if the button is disabled
                        if(player.controlform.cc.disabled) { return false; }

                        //if we're controlling youtube captions then the cc button is an on/off switch
                        if(player.tracks.youtube_captions)
                        {
                            //invert the youtube captions enabled flag
                            player.tracks.youtube_captions.enabled = !player.tracks.youtube_captions.enabled;

                            //load or unload the captions module accordingly
                            player.media.youTubeApi[(player.tracks.youtube_captions.enabled ? '' : 'un') + 'loadModule']('cc');
                            player.media.youTubeApi[(player.tracks.youtube_captions.enabled ? '' : 'un') + 'loadModule']('captions');

                            //then update the button state
                            updateControlState(player, 'cc', (player.tracks.youtube_captions.enabled ? 'on' : 'off'));
                        }

                        //else if we're controlling vimeo captions then the cc button is an on/off switch
                        else if(player.tracks.vimeo_captions)
                        {
                            //invert the vimeo captions enabled flag
                            player.tracks.vimeo_captions.enabled = !player.tracks.vimeo_captions.enabled;

                            //enable or disable the text track accordingly
                            //or if that fails (eg. invalid language code) then show the CC button error state
                            //nb. the vimeo API returns a Promise, which IE11 doesn't fully support
                            //and a failure due to invalid language code may still show captions
                            //maybe it just selects from available languages randomly, dk
                            //but those captions can't be controlled because the CC button is disabled now
                            player.media.vimeoPlayer[(player.tracks.vimeo_captions.enabled ? 'enable' : 'disable') + 'TextTrack'](player.tracks.vimeo_captions_lang)
                                .then(function(){})
                                .catch(function(ex)
                                {
                                    player.tracks.vimeo_captions.enabled = false;
                                    updateControlState(player, 'cc', 'off');
                                    updateControlDisabled(player, 'cc', true);
                                    etc.render(player.controlform.cc,
                                    {
                                        'aria-label' : getLang(player, 'button-cc-error')
                                    });
                                });

                            //then update the button state
                            updateControlState(player, 'cc', (player.tracks.vimeo_captions.enabled ? 'on' : 'off'));
                        }

                        //else if we only have one track language then the cc button is an on/off switch
                        else if(!player.tracks.captions.i18n)
                        {
                            //*** DEV TMP
                            //if(__.console) { console.log('CC button (one language)'); }

                            //invert the captions enabled flag, then if we're enabling captions
                            if(player.tracks.captions.enabled = !player.tracks.captions.enabled)
                            {
                                //set the captions tracks captions-selected flag
                                //to the first value in the tracks languages array
                                //ie. the only value since we only have one language
                                player.tracks.captions.selected.captions = player.tracks.captions.languages[0];

                                //update the disabled state of the captions container itself
                                //removing the disabled class in order to display it
                                etc.removeClass(player.captions, config.classes['state-disabled']);

                                //then load and display the corresponding captions
                                player.controlform.cc.display();
                            }

                            //else [if we're disabling captions]
                            else
                            {
                                //reset the captions-selected flag to off
                                player.tracks.captions.selected.captions = 'off';

                                //update the disabled state of the captions container itself
                                //adding the disabled class in order to undisplay it
                                etc.addClass(player.captions, config.classes['state-disabled']);

                                //then clear the captions container and reset its data cue attribute,
                                //which we have to do in case you're viewing them with CSS disabled,
                                //because in that case the undisplay styling won't have any effect
                                //nb. clearing an element's content by setting innerHTML to empty string
                                //is like 10 or 20 times faster than iteratively removing its child nodes
                                player.captions.innerHTML = '';
                                player.captions.setAttribute('data-cue', '');
                            }

                            //then update the button state
                            updateControlState(player, 'cc', (player.tracks.captions.enabled ? 'on' : 'off'));

                            //and then if captions are enabled and the readyState is 2,
                            //update the button's aria-label and text to show the loading message
                            //including re-applying the slider widths if images are disabled and it's necessary
                            //ie. so it doesn't show the message when captions are off,
                            //but if you turn them off and on again while it's still
                            //loading, then it will still show the loading message
                            if(player.tracks.captions.enabled && player.tracks.captions[player.tracks.captions.selected.captions].readyState == 2)
                            {
                                updateControlText(player, 'cc', getLang(player, 'button-cc-loading'), getLang(player, 'text-cc-loading'));
                            }

                            //*** DEV TMP
                            //var str = '#' + player.instance.id + '\nenabled = ' + player.tracks.captions.enabled + '\n' + 'selected captions = "' + player.tracks.captions.selected.captions + '"\n' + 'selected transcript = "' + player.tracks.captions.selected.captions + '"\n';
                            //console.warn(str);

                            //*** DEV TMP
                            //if(__.console) { console.log(etc.dump(player.tracks)); }
                        }

                        //else if we have multiple track languages then it's a menu trigger
                        else
                        {
                            //*** DEV TMP
                            //if(__.console) { console.log('CC button (multiple languages)'); }

                            //create a shortcut reference to the menu since we'll need it a lot
                            var menu = player.controlform['menu-cc'];

                            //if CSS is disabled, or the menu is currently hidden
                            if(!haveCSS(menu) || menu.getAttribute('aria-hidden') == 'true')
                            {
                                //if CSS is enabled
                                if(haveCSS(menu))
                                {
                                    //get the button's right edge position to use as an anchor point
                                    var anchor = player.controlform.cc.offsetLeft + player.controlform.cc.offsetWidth;

                                    //limit the max-width to the anchor so it can't overhang the left edge of the video
                                    //nb. apply this even if not required in case of text size increases while menu is open
                                    //nb. this is unlikely to be needed except for unusually long labels with small videos
                                    menu.style.maxWidth = anchor + 'px';

                                    //don't limit the height for the audio-only player because we have no constraining element
                                    //the menu opens beneath the controlform and flows downward, so any viewport overflow
                                    //can be handled by regular browser scrolling just like any other page content
                                    if(!player.isaudio)
                                    {
                                        //limit the max-height to the vertical space inside the player
                                        //ie. from the top of the video to the top of the control form
                                        //minus the fixed 5px gap between the menu and the control form
                                        //nb. apply this even if not required in case of text size increases while menu is open
                                        //nb. this is unlikely to be needed except for unusually tall menus with small videos
                                        menu.style.maxHeight = (player.controlform.offsetTop - 5) + 'px';
                                    }

                                    //then position the menu so its right edge is at the anchor
                                    //nb. using right positioning so that width increases caused
                                    //by text-size increases will flow to the left not the right
                                    //so that the menu retains the same anchor point throughout
                                    menu.style.right = (player.container.clientWidth - anchor) + 'px';

                                    //now toggle aria-hidden to show it
                                    menu.setAttribute('aria-hidden', 'false');
                                }

                                //then restore tabindex=0 and focus on the currently selected item
                                //or the "off" item if the selected item is null or undefined
                                //while setting tabindex=-1 on all the other items
                                etc.each(menu.menuitems, function(nextmenuitem, itemkey)
                                {
                                    if
                                    (
                                        (
                                            itemkey == player.tracks.captions.selected.captions
                                            &&
                                            etc.def(nextmenuitem, null)
                                        )
                                        ||
                                        (
                                            itemkey == 'off'
                                            &&
                                            !etc.def(menu.menuitems[player.tracks.captions.selected.captions], null)
                                        )
                                    )
                                    {
                                        //if CSS is enabled and this is the audio-only player
                                        //hide the off item unless this is it (ie. it's getting tabindex 0)
                                        //so that it's only ever visible as a fallback for load failure
                                        //(see addControlMenu for more notes about that situation)
                                        if(haveCSS(menu) && player.isaudio)
                                        {
                                            etc.render(menu.menuitems.off, { 'aria-hidden' : (itemkey == 'off' ? 'false' : 'true') });
                                        }

                                        nextmenuitem.tabIndex = 0;
                                        nextmenuitem.focus();
                                    }
                                    else if(nextmenuitem !== null)
                                    {
                                        nextmenuitem.tabIndex = -1;
                                    }
                                });

                                //if captions are enabled
                                if(player.tracks.captions.enabled)
                                {
                                    //if the selected captions data is currently loading
                                    //disable the language menu items while we're loading
                                    if(player.tracks.captions[player.tracks.captions.selected.captions].readyState == 2)
                                    {
                                        updateControlMenuDisabled(player, 'cc', true);
                                    }
                                }

                                //[else] if captions are currently off and we have a transcript
                                else if(player.transcript)
                                {
                                    //if the selected transcript data is currently loading
                                    //disable the language menu items while we're loading
                                    if(player.tracks.captions[player.tracks.captions.selected.transcript].readyState == 2)
                                    {
                                        updateControlMenuDisabled(player, 'cc', true);
                                    }
                                }
                            }

                            //else [if it's already visible]
                            else
                            {
                                //toggle aria-hidden to hide it
                                menu.setAttribute('aria-hidden', 'true');
                            }
                        }
                    }
                }
            );

            //then if we're using track captions
            if(player.tracks.captions)
            {
                //if captions have already failed entirely
                if(!player.tracks.captions.languages.length)
                {
                    //update the cc button to the "off" state
                    updateControlState(player, 'cc', 'off');

                    //disable the cc button true
                    updateControlDisabled(player, 'cc', !player.tracks.captions.languages.length);

                    //update the button's aria-label to show a short general error message
                    etc.render(player.controlform.cc,
                    {
                        'aria-label' : getLang(player, 'button-cc-error')
                    });
                }

                //else if we have multiple languages
                else if(player.tracks.captions.i18n)
                {
                    //add aria-haspoup to the button to denote that it's a menu trigger
                    player.controlform.cc.setAttribute('aria-haspopup', 'true');

                    //if captions are enabled and the captions data has already loaded
                    if(player.tracks.captions.enabled && player.tracks.captions[player.tracks.captions.selected.captions].readyState == 4)
                    {
                        //update the button's aria-label and text with the language-specific text
                        //converting the text language code to uppercase so it's visually different from "off"
                        //(and because it's an initialism, although ATs will read the aria-label anyway)
                        //including re-applying the slider widths if images are disabled and it's necessary
                        updateControlText(player, 'cc',
                            etc.sprintf(getLang(player, 'button-cc-lang'), { '1' : player.tracks.captions[player.tracks.captions.selected.captions].label }),
                            etc.sprintf(getLang(player, 'text-cc-lang'), { '1' : player.tracks.captions.selected.captions.toUpperCase() })
                            );
                    }

                    //nb. we can't show a language-specific error message here
                    //if the default captions data has already failed, because the
                    //captions.selected.captions flag will already be set to "off" by now

                    //build a dictionary of data for the cc menu items
                    //starting with the key and label for the "off" item
                    //nb. by using the language array to build this data
                    //we're only including items which haven't already failed to load
                    var menudata =
                    {
                        'off' :
                        {
                            'label' : getLang(player, 'menu-cc-off')
                        }
                    };
                    //nb. only the members which correspond with a language track
                    //will have a lang property, so that each of those menu items
                    //has its own lang attribute, but the off item doesn't
                    etc.each(player.tracks.captions.languages, function(srclang)
                    {
                        menudata[srclang] =
                        {
                            'lang'  : srclang,
                            'label' : player.tracks.captions[srclang].label
                        }
                    });

                    //then create a cc menu inside the controls fieldset
                    //inserted inside the cc button field wrapper, before the button
                    //so that tabbing out of it goes back to the cc button again
                    //and so its source position usually matches its visual position
                    //(because it will be above the button unless forced to reposition below)
                    //nb. the open-bracket must be on the same line for function name compression
                    addControlMenu(
                        player,
                        'cc',
                        menudata,
                        {
                            //define an abstraction for the menu item selection handler
                            '.selection' : function(menu, srclang, etype)
                            {
                                //if the menu is disabled, just ignore this
                                if(menu.__disabled)
                                {
                                    //*** DEV TMP
                                    //if(__.console) { console.log('=> [DISABLED IGNORE] SELECTION (srclang="' + srclang + '", type="' + etype + '")'); }

                                    return;
                                }

                                //*** DEV TMP
                                //if(__.console) { console.log('=> SELECTION (srclang="' + srclang + '", type="' + etype + '")'); }

                                //update the disabled state of the captions container itself
                                //adding the disabled class in order to undisplay it
                                //nb. we do this first so that the current language doesn't continue
                                //to display (and be frozen) while loading the newly selected language
                                etc.addClass(player.captions, config.classes['state-disabled']);

                                //then clear the captions container and reset its data cue attribute,
                                //which we have to do in case you're viewing them with CSS disabled,
                                //because in that case the undisplay styling won't have any effect
                                player.captions.innerHTML = '';
                                player.captions.setAttribute('data-cue', '');

                                //uncheck the currently checked menuitem if it exists and is not null
                                //nb. if it was defined then removed by load failure then it will be null
                                //but if load failure occurred before the controls were built it will be undefined
                                if(etc.def(menu.menuitems[player.tracks.captions.selected.captions], null))
                                {
                                    menu.menuitems[player.tracks.captions.selected.captions].setAttribute('aria-checked', 'false');
                                }

                                //update the selected-captions flag and check the corresponding menuitem
                                menu.menuitems[player.tracks.captions.selected.captions = srclang].setAttribute('aria-checked', 'true');

                                //check the fallback radio input inside the selected menuitem
                                //nb. these are only seen and used when viewed without CSS
                                menu.menuitems[srclang].firstChild.checked = true;

                                //*** DEV TMP
                                //if(__.console) { console.log('selected.captions = ' + player.tracks.captions.selected.captions); }

                                //update the captions enabled flag according to whether we're switching to/from "off"
                                //then if we're enabling captions
                                if(player.tracks.captions.enabled = !(srclang == 'off'))
                                {
                                    //if we have a transcript
                                    if(player.transcript)
                                    {
                                        //update the transcript-selected flag to match
                                        player.tracks.captions.selected.transcript = srclang;

                                        //*** DEV TMP
                                        //if(__.console) { console.log('selected.transcript = ' + player.tracks.captions.selected.transcript); }
                                    }

                                    //update the disabled state of the captions container itself
                                    //removing the disabled class in order to display it
                                    etc.removeClass(player.captions, config.classes['state-disabled']);

                                    //then load and display the corresponding captions (and transcript if applicable)
                                    player.controlform.cc.display();
                                }

                                //else [if we're disabling them]
                                else
                                {
                                    //update the button state to "off"
                                    updateControlState(player, 'cc', 'off');
                                }

                                //and then if captions are enabled and the readyState is 2,
                                //update the button's aria-label and text to show the loading message
                                //including re-applying the slider widths if images are disabled and it's necessary
                                //ie. so it doesn't show the message when captions are off,
                                //but if you turn them off and on again while it's still
                                //loading, then it will still show the loading message
                                if(player.tracks.captions.enabled && player.tracks.captions[player.tracks.captions.selected.captions].readyState == 2)
                                {
                                    updateControlText(player, 'cc', getLang(player, 'button-cc-loading'), getLang(player, 'text-cc-loading'));
                                }

                                //*** DEV TMP
                                //var str = '#' + player.instance.id + '\nenabled = ' + player.tracks.captions.enabled + '\n' + 'selected captions = "' + player.tracks.captions.selected.captions + '"\n' + 'selected transcript = "' + player.tracks.captions.selected.captions + '"\n';
                                //console.warn(str);
                            },

                            //define an abstraction for the menu item command handler
                            '.ozcommand'  : function(menu, srclang, etype)
                            {
                                //if the menu is disabled, just ignore this
                                if(menu.__disabled)
                                {
                                    //*** DEV TMP
                                    //if(__.console) { console.log('=> [DISABLED IGNORE] COMMAND (srclang="' + srclang + '", type="' + etype + '")'); }

                                    return;
                                }

                                //*** DEV TMP
                                //if(__.console) { console.log('=> COMMAND (srclang="' + srclang + '", type="' + etype + '")'); }

                                //select the target item
                                player.controlform['menu-cc'].selection(menu, srclang, etype);

                                //if css is enabled, close the menu and set focus on the button
                                //nb. don't do this without CSS because we can't hide the menu
                                //and shifting focus in that situation is odd and unintuitive
                                if(haveCSS(menu))
                                {
                                    menu.setAttribute('aria-hidden', 'true');
                                    player.controlform.cc.focus();
                                }
                            }
                        }
                    );

                    //if CSS is disabled
                    if(!haveCSS(player.controlform['menu-cc']))
                    {
                        //if the selected captions data has already failed to load
                        //set tabindex 0 on the "off" item and -1 on all others
                        //nb. this would normally be done in the command function next time the menu opens
                        //but that's not applicable here since the non-CSS menu content is permanently visible
                        if(player.tracks.captions[player.tracks.captions.selected.captions].readyState == 0)
                        {
                            etc.each(player.controlform['menu-cc'].menuitems, function(nextmenuitem, itemkey)
                            {
                                if(nextmenuitem !== null)
                                {
                                    nextmenuitem.tabIndex = itemkey == 'off' ? 0 : -1;
                                }
                            });
                        }

                        //[else] if captions are enabled
                        else if(player.tracks.captions.enabled)
                        {
                            //if the selected captions data is currently loading
                            //disable the language menu items while we're loading
                            if(player.tracks.captions[player.tracks.captions.selected.captions].readyState == 2)
                            {
                                updateControlMenuDisabled(player, 'cc', true);
                            }
                        }

                        //[else] if captions are currently off and we have a transcript
                        else if(player.transcript)
                        {
                            //if the selected transcript data is currently loading
                            //disable the language menu items while we're loading
                            if(player.tracks.captions[player.tracks.captions.selected.transcript].readyState == 2)
                            {
                                updateControlMenuDisabled(player, 'cc', true);
                            }
                        }
                    }
                }
            }

            //in iOS (iPad) with the stack layout the native click to play icon
            //has an overlay which covers the entire toolbar until it plays
            //so we have to disable all the buttons that are affected by this
            //ie. all that would be enabled otherwise, must be disabled specially
            //however since we disable the play button all the time before playback
            //not just for stack controls, do the same thing here for consistency
            //and also do the same for android since we have to disable the fullscreen
            //button for other reasons, so disabling this also helps visual consistency
            //but don't do that for ios and android if this is the audio-only player
            //because there's no need for it to be disabled since you can use it
            //as soon as the transcript is available, and having it enabled is
            //more consistent with the play button also being enabled in that case
            //we also do this for youtube and vimeo captions since the API functions
            //that switch embedded captions on and off are not available until playback
            if
            (
                player.tracks.youtube_captions
                ||
                player.tracks.vimeo_captions
                ||
                (
                    (defs.agent.ios || defs.agent.android)
                    &&
                    !player.isaudio
                )
            )
            {
                //so disable the button by default
                updateControlDisabled(player, 'cc', true);

                //then bind a media play event, with which we can re-enable it
                //unless we've already establish by now that track captions have failed
                //and then we can silence the event since we won't need it again
                //(although it only fires once anyway, we may as well clean up)
                //nb. in iOS we can use "canplay" but that fires too soon in Android
                //however the first "play" event is soon enough to handle both cases
                var ccbutton = etc.listen(player.media, 'play', function()
                {
                    ccbutton.silence();

                    if(player.tracks.youtube_captions || player.tracks.vimeo_captions || player.tracks.captions.languages.length)
                    {
                        updateControlDisabled(player, 'cc', false);
                    }
                });
            }

            //bind the button's click handler to its command abstraction
            addControlClick(player, 'cc');

            //then add it to the lastChild buttonkeys
            player.buttonkeys.lastChild.push('cc');
        }

        //if we've added the cc button, add another cheeky <br>
        if(player.controlform.cc)
        {
            etc.build('br', { '=parent' : player.controlform.lastChild });
        }


        //if we have audio descriptions or audio links data
        if(player.audiodesk || player.audiolinks)
        {
            //abstract the initial "on" state, which for actual audio
            //is determined by whether the audio is currently enabled
            if(player.audiodesk)
            {
                var onstate = player.audiodesk.enabled ? 'on' : 'off';
            }

            //or for audio links it's determined by comparing
            //the on and off URLs with the current page address
            else
            {
                //we already have both URLs saved and qualified in the audiolinks object
                //so we can determine whether we're in the "on" state by substring comparison
                //of the on URL within the current document URL, and if not then default to "off"
                //nb. we need to have a default state in case either of the URLs is broken
                //so we may as well assume that everything which isn't "on" must be "off"
                //then we get that default, and save on having to do more than one evaluation
                //nb. we compare the URLs inside the current location so that the current
                //location can contain additional query data without failing to match
                onstate = _.location.href.indexOf(player.audiolinks.on) < 0 ? 'off' : 'on';
            }

            //create a span-wrapped ad button inside the second fieldset with the corresponding state
            //nb. the open-bracket must be on the same line for function name compression
            addControlButton(
                player,
                player.controlform.lastChild,
                'ad',
                true,
                onstate,
                onstate,
                {
                    //then define an abstraction for the button's command handler
                    '.ozcommand'  : function()
                    {
                        //*** DEV TMP
                        //if(__.console) { console.log('player.controlform.ad.ozcommand()'); }

                        //reset the keyclick flag
                        player.keyclick = false;

                        //ignore this event if the button is disabled
                        if(player.controlform.ad.disabled) { return false; }

                        //then if actual audio descriptions are available
                        if(player.audiodesk)
                        {
                            //if we're enabling audio but haven't yet initialised it
                            //nb. this will only happen if audio was turned off
                            //by default and has now been turned on by the user
                            if(!player.audiodesk.enabled && !player.audio)
                            {
                                //initialise the audio now, constructing its audio element
                                //and defining its initialisation events and "auto" preload
                                audioConstruct(player, true);

                                /*** DEV LOG ***//*
                                if(player.audio) { doAudioLogging(player); } */

                                //then if the media is already playing,
                                //call the play function to play the audio
                                if(!player.media.paused)
                                {
                                    playMedia(player);
                                }
                            }

                            //invert the audio enabled flag
                            player.audiodesk.enabled = !player.audiodesk.enabled;

                            //then if we're [re-]enabling the audio, it won't have
                            //been synchronising while it was disabled, so call the
                            //synchronisation function now to bring it back into sync
                            if(player.audiodesk.enabled)
                            {
                                audioSynchronise(player);
                            }

                            //else [if we're disabling audio and] we have xad data
                            else if(player.tracks.xad)
                            {
                                //if an xad cue is currently playing
                                //nb. there's no need to check the ready states
                                //of the audio and xad data, because the playing flag
                                //wouldn't be true unless all of that was already checked
                                if(player.audiodesk.xad.playing)
                                {
                                    //stop any playing xad audio and reset xad tracking
                                    //setting lastcue to null so it can be selected again
                                    xadReset(player, null);

                                    //*** DEV TMP
                                    //console.error('AD-OFF-RESET\n'
                                    //    + '\nplaying   = ' + player.audiodesk.xad.playing
                                    //    + '\nactivecue = ' + (player.audiodesk.xad.activecue ? ('["' + player.audiodesk.xad.activecue.id + '"]') : 'NULL')
                                    //    + '\nlastcue   = ' + (player.audiodesk.xad.lastcue ? ('["' + player.audiodesk.xad.lastcue.id + '"]') : 'NULL')
                                    //    + '');
                                }
                            }

                            //and then set audio muted to the opposite of enabled
                            //or set it to true if the video itself is also muted
                            //or if we're currently waiting for video to load
                            //nb. our volumechange events won't respond to this
                            //because they're only bound to the video
                            player.audio.muted = player.media.muted || player.audiodesk.waiting ? true : !player.audiodesk.enabled;

                            //update the button state
                            updateControlState(player, 'ad', (player.audiodesk.enabled ? 'on' : 'off'));

                            //then if the ready state is less than 2 after video playback
                            //has started and we're enabling audio, then showing the loading
                            //message to indicate we're still waiting for enough data to laod
                            if(player.audio.readyState < 2 && player.started && player.audiodesk.enabled)
                            {
                                //update the button's aria-label to show the loading message
                                etc.render(player.controlform.ad,
                                {
                                    'aria-label' : getLang(player, 'button-ad-loading')
                                });

                                //but bind a one-off canplay event to set it back to normal
                                //just in case you disable AD during the initial media loading period
                                //but the AD is already fully cached, in which case it will still
                                //have a ready state of 1 when re-enabled until it starts to play
                                var canplay = etc.listen(player.audio, 'canplay', function()
                                {
                                    //silence this event
                                    canplay.silence();

                                    //update the button's aria-label to show the text corresponding with its state
                                    etc.render(player.controlform.ad,
                                    {
                                        'aria-label' : getLang(player, 'button-ad-' + (player.audiodesk.enabled ? 'on' : 'off'))
                                    });
                                });
                            }
                        }

                        //else if the button is just for audio links
                        else
                        {
                            //the button serves merely as a link to an alternative page URL
                            //so if the state is "on" we want to go to the "off" URL, or vice versa
                            _.location.href = player.audiolinks[onstate == 'on' ? 'off' : 'on'];
                        }
                    }
                }
            );

            //then if we have enabled AD but it's already failed to load
            if(player.audiodesk && player.audiodesk.enabled && !player.audio)
            {
                //disable the ad button and update it to the "off" state
                //(so it's both grayed and dimmed, and clearly out of it!)
                updateControlDisabled(player, 'ad', true);
                updateControlState(player, 'ad', 'off');

                //update the button's aria-label with a short general error message
                etc.render(player.controlform.ad, { 'aria-label' : getLang(player, 'button-ad-error') });
            }

            //bind the button's click handler to its command abstraction
            addControlClick(player, 'ad');

            //then add it to the lastChild buttonkeys
            player.buttonkeys.lastChild.push('ad');
        }

        //if we've added the ad button, add another cheeky <br>
        if(player.controlform.ad)
        {
            etc.build('br', { '=parent' : player.controlform.lastChild });
        }


        //changing the volume doesn't work in iOS, which must be deliberate
        //so that media objects can't be different from the system volume
        //(in fact its native media players don't even have volume controls)
        //so there's no point adding the controls since they won't do anything

        // TL: 2022-09-01
        // Test whether volume can be changed rather than relying on the user agent type
        // This *should* be more intuitive and support iPad, where the user agent does not present as iOS
        // but still does not allow volume changes independant from the system volume.

        let v = player.media.volume;
        player.media.volume = 0.5;
        let hasVolumeControl = Boolean(player.media.volume === 0.5);
        player.media.volume = v;

        if(hasVolumeControl)
        {
            //create a span-wrapped mute button inside the second fieldset
            //with its state according to the default muting, which will be
            //true if the user has no sound output, or if the persisted
            //volume was zero for browsers using the flash player
            //(which can only implement mute by setting volume to zero)
            //nb. the open-bracket must be on the same line for function name compression
            addControlButton(
                player,
                player.controlform.lastChild,
                'mute',
                true,
                (player.media.muted ? 'on' : 'off'),
                (player.media.muted ? 'on' : 'off'),
                {
                    //then define an abstraction for the button's command handler
                    '.ozcommand'  : function()
                    {
                        //reset the keyclick flag
                        player.keyclick = false;

                        //ignore this event if the button is disabled
                        if(player.controlform.mute.disabled) { return false; }

                        //invert the current muting (without changing the volume)
                        //nb. if the user has no sound output then this will have no effect
                        //ie. whatever you set for muted it will always be true
                        setMediaVolume(player, null, !player.media.muted);

                        //then update the mute button state, passing a state array
                        //that defines the updated on/off state, as well as a
                        //high/low state corresponding with the current volume
                        updateControlState(player, 'mute',
                        [
                            (player.media.muted ? 'on' : 'off'),
                            (player.media.volume < 0.5 ? 'low' : 'high')
                        ]);

                        //then update the volume slider, either setting it to zero if
                        //the media is muted, else converting the volume to an
                        //integer in the volume slider's index range (0 - 10)
                        //nb. we set it to zero for muted because that's a common convention
                        //which is so you can un-mute by increasing the volume from zero
                        //(ie. so you can go from muted to quiet without being loud in-between)
                        //nb. this will also update the value in the underlying input
                        dispatchMediaSliderEvent(player.controlform.volume, player.media.muted ? 0 : Math.round(player.media.volume * 10));
                    }
                }
            );

            //then add the button "high" or "low" state class according to the default volume
            //nb. this allows the button to be both a mute control and a volume indicator
            //(although the latter is just a visual detail, it's not semantic information)
            //i.e. you can click this button to mute or un-mute, but it also
            //has a secondary class that updates to indicate high or low volume
            //(which itself is controlled with the separate volume slider)
            etc.addClass(player.controlform.mute, config.classes['field-state-' + (player.media.volume < 0.5 ? 'low' : 'high')]);

            //bind the button's click handler to its command abstraction
            addControlClick(player, 'mute');

            //then add it to the lastChild buttonkeys
            player.buttonkeys.lastChild.push('mute');


            //create a span-wrapped volume input inside the second fieldset
            //including the field wrapper classes (but we don't need a state class)
            //defining a name so we can refer to it in the control form collection
            //but also explicitly creating that reference just to be on the safe side
            //and we also have to define an ID because the slider script requires one
            //set the range from 0 - 10 and the step to 1 (representing .1 increments)
            //then set the default value from the default media volume (that we set earlier)
            //also define aria-hidden so that screenreaders will ignore it
            //and use the aria data defined on the custom slider instead
            //nb. the custom sliders function will add and maintain its title
            //nb. using 0 - 11 would be more "tap" (like BBC iPlayer), but then there's a
            //potential cognitive barrier there, and it makes the numbers more convoluted
            //ie. setting a volume programatically might not correspond with a slider value
            //and we'd have to arse about converting with ((round(10 / 11) * value) / 10)
            //which would mean that the volume you set might not be exactly what you get
            //nb. also add a single space after button, just to create basic spacing
            etc.build('span',
            {
                '=parent'           : player.controlform.lastChild,
                'class'             : config.classes['field-wrapper']
                                    + ' '
                                    + config.classes['field-volume'],
                '#dom'              : (player.controlform.volume = etc.build('input',
                {
                    'type'          : slidertype,
                    'name'          : 'volume',
                    'id'            : etc.sprintf(config.ids['slider'],
                    {
                        'id'        : player.container.id,
                        'field'     : config.classes['field-volume']
                    }),
                    'aria-hidden'   : 'true',
                    'min'           : '0',
                    'max'           : '10',
                    'step'          : '1',
                    'value'         : Math.round(player.media.volume * 10),

                    //add a mouseup focuser for the benefit of webkit
                    //which otherwise doesn't focus the input when you click it
                    'onmouseup'     : function(e, thetarget){ if(!thetarget.disabled) { thetarget.focus(); } }
                })),
                '#text' : ' '
            });
        }


        //*** DEV TMP
        //__.localStorage.removeItem(player.basekey + config['user-pin']);

        //look for a pinned setting in user config, or default to true
        //then if pinned is true, apply the container pinned class
        //nb. see controlform '.pinned' definition for more notes about this
        var p = library.getStorageValue(player.basekey, config['user-pin']) || 'on';
        if(player.controlform.pinned = (p == 'on'))
        {
            etc.addClass(player.container, config.classes['pinned-controls']);
        }

        //*** DEV TMP
        //console.warn('stored = ' + library.getStorageValue(player.basekey, config['user-pin']) + '\npinned = ' + player.controlform.pinned);

        //create a span-wrapped pin button inside the second fieldset
        //with its state matching .pinnned and the button enabled by default
        //nb. the open-bracket must be on the same line for function name compression
        addControlButton(
            player,
            player.controlform.lastChild,
            'pin',
            true,
            (player.controlform.pinned ? 'on' : 'off'),
            (player.controlform.pinned ? 'on' : 'off'),
            {
                //then define an abstraction for the button's command handler
                //so we can call it programatically (eg. from the global key handler)
                '.ozcommand'  : function()
                {
                    //*** DEV TMP
                    //if(__.console) { console.log('player.controlform.pin.ozcommand()'); }

                    //invert the current pinned state, then if we're setting it to true
                    //add the container pinned class, otherwise remove the class
                    if(player.controlform.pinned = !player.controlform.pinned)
                    {
                        etc.addClass(player.container, config.classes['pinned-controls']);
                    }
                    else
                    {
                        etc.removeClass(player.container, config.classes['pinned-controls']);

                        //then if we've defined the autohiding management object
                        //and the media is currently playing, immediately hide the controls
                        //nb. this will make it more obvious what the button's function is
                        if
                        (
                            etc.def(player.autohiding)
                            &&
                            !player.media.paused
                        )
                        {
                            //we'll have to unprime the auto-show events first to prevent conflict
                            unprimeAutoHiding(player);

                            //now pause for a fraction so it doesn't seem too sudden
                            etc.delay(500, function()
                            {
                                //then apply the hiding state
                                autoHidingState(player);

                                //then re-prime autohiding without re-showing the controls
                                primeAutoHiding(player, true);
                            });
                        }
                    }

                    //update the button state
                    updateControlState(player, 'pin', player.controlform.pinned ? 'on' : 'off');

                    //then pass the basekey and user-pin key to the add storage function
                    //along with the current state value ("on" or "off)
                    //which will save the updated value to local storage, unless the basekey is null
                    //(which it only will be if config has explicitly disabled user persistence)
                    library.addStorageValue(
                        player.basekey,
                        config['user-pin'],
                        player.controlform.pin.state
                        );
                }
            }
        );

        //bind the button's click handler to its command abstraction
        addControlClick(player, 'pin');

        //then add it to the lastChild buttonkeys
        player.buttonkeys.lastChild.push('pin');


        //detect the supported fullscreen model
        //nb. iOS only supports video fullscreen, not container fullscreen
        //which means it won't have custom controls in fullscreen mode
        var screentype = library.getFullscreenModel(player.video);

        //there are also cases where we need to explicitly disable fullscreen
        //=> the video-only fullscreen model doesn't work with non-native video
        //=> in windows/safari it sometimes just fails to happen, but even when it does
        //   it introduces a stacking context problem because of the new base z-index
        //   whereby the transcript container ends up still visible above the fullscreen video
        //   and this could happen more generally with positioned content at the same context
        //   so it's safer and more reliable if we just get rid of fullscreen mode
        //   (and windows versions of safari aren't officially supported anymore anyway)
        //=> in firefox 10-15 it fails to resize the screen and controls properly
        //   while in firefox 9 it just plain doesn't work even though it claims support
        //   (and firefox 9-30 aren't officially supported anymore anyway)
        if
        (
            (screentype == 'webkit-video' && player.mode != 'native')
            ||
            (defs.agent.safari && defs.agent.windows)
            ||
            defs.agent.firefox15m
        )
        {
            screentype = null;
        }

        //also disable fullscreen if the config allow-fullscreen option is false
        //nb. this provides a means for site owners to prevent a video playing fullscreen
        //(except of course for the external player that mobile devices use)
        if(!config['allow-fullscreen'])
        {
            screentype = null;
        }


        //then if we [still] have a supported fullscreen mode
        if(screentype !== null)
        {
            //define a fullscreen permissions flag that we'll use to record
            //whether the fullscreen enter command actually worked, or was blocked
            //nb. if user permissions are to ask each time then the screenchange
            //event will still occur, so we handle it within the event, but if
            //they're set to block outright then we won't get an event at all
            var screenpermission = false,

            //now get the fullscreen event name, if we have one
            //nb. the video-only model doesn't have a screen event
            //but it does have a video event that we'll handle separately
            screenevent =
                screentype == 'webkit-screen'   ? 'webkitfullscreenchange'
                : screentype == 'moz-screen'    ? 'mozfullscreenchange'
                : screentype == 'ms-screen'     ? 'MSFullscreenChange'
                : screentype == 'screen'        ? 'fullscreenchange'
                : null;


            //now add another cheeky <br> so this button has a line of its own
            etc.build('br', { '=parent' : player.controlform.lastChild });

            //create a span-wrapped fullscreen button inside the second fieldset
            //with its state set to "off" but the button enabled by default
            //nb. the open-bracket must be on the same line for function name compression
            addControlButton(
                player,
                player.controlform.lastChild,
                'fullscreen',
                true,
                'off',
                'off',
                {
                    //copy the screentype key
                    '.screentype'   : screentype,

                    //create properties we can use for recording the
                    //video width and height before resizing into fullscreen
                    '.videowidth'   : 0,
                    '.videoheight'  : 0,

                    //then define an abstraction for the screenchange event
                    //nb. we would actually get smoother results if we resized the
                    //container before it goes to fullscreen, but we musn't do that,
                    //because we can't guarantee that it's happened until the event fires
                    //(eg. it won't fire if user permissions have already blocked fullscreen)
                    //indeed the overall process is pretty inelegant, but it does the job!
                    '.screenchange' : function(e, thetarget)
                    {
                        //if this is not the designated fullscreen player, just ignore the event
                        if(screenplayer != player) { return; }

                        //close the language menu if it exists and is open and CSS is enabled
                        //nb. another way of handling this would be to only close the menu and not exit fullscreen
                        //if escape is pressed while the menu is open in fullscreen mode, but this is more robust
                        //and easier to implement and also avoids having to reposition the menu when entering fullscreen
                        //(although that happens anyway via other close events, so that part is just belt and braces)
                        //(plus I'm not entirely sure we can handle that native escape key action anyway,
                        // otherwise why is the existing escape key handler not closing the menu in this case?)
                        //* this is not generic enough to handle multiple menus
                        if
                        (
                            player.controlform['menu-cc']
                            &&
                            haveCSS(player.controlform['menu-cc'])
                            &&
                            player.controlform['menu-cc'].getAttribute('aria-hidden') == 'false'
                        )
                        {
                            //*** DEV TMP
                            //console.log('*** FS CLOSE!!!');

                            player.controlform['menu-cc'].setAttribute('aria-hidden', 'true');
                        }


                        //save a shortcut reference to this button, since we'll need it a lot
                        //then get the current fullscreen mode and save it to the player fullscreen flag
                        //then if we're now in fullscreen mode, we need to expand the player fill the screen
                        if(player.fullscreen = library.isFullscreen(player.video, (button = player.controlform.fullscreen).screentype))
                        {
                            //set the scren permission flag since the event implies permission
                            //nb. if this was fired in advance of a confirmation prompt, then we'll
                            //still have to check it again next time, which is why we reset it on exit
                            screenpermission = true;

                            //remove the smallscreen or midscreen classes as applicable
                            etc.removeClass(player.container, config.classes['smallscreen'] + ' ' + config.classes['midscreen']);

                            //apply role=dialog and aria-modal so that ATs keep the read cursor inside the player
                            player.container.setAttribute('role', 'dialog');
                            player.container.setAttribute('aria-modal', 'true');

                            //apply the container fullscreen class
                            etc.addClass(player.container, config.classes['container-fullscreen']);

                            //then if the screen height is greater than 480, apply the large-controls classes
                            //nb. for smaller screens we don't need large controls because the small controls
                            //will be large enough relative to the screen; indeed, the large controls would
                            //seem way too large, especially on handheld devices eg. android with chrome,
                            //and if we used them on smaller screens there wouldn't be enough space for the sliders
                            if(screen.height > 480)
                            {
                                etc.addClass(player.container, config.classes['large-controls']);
                            }


                            //then if the controls options isn't already "stack"
                            //add the container stack-controls class
                            if(player.options.controls != 'stack')
                            {
                                etc.addClass(player.container, config.classes['stack-controls']);
                            }

                            //then if we've defined the autohiding management object
                            //and the media is currently playing, apply the showing state and define
                            //the auto-hiding and auto-showing events (if they haven't already been defined)
                            //nb. we don't need to do this if it's buffering because the controls
                            //should stay visible, and will be auto-hidden by the next play event
                            //else they'll be silenced by the next pause event, and so on
                            //in fact it won't usually be necessary at all, since entering fullscreen
                            //is usually preceded by other events, however it is possible to double-click
                            //when your mouse is already over the video without triggering a mousemove event
                            //and it's as well to be robust with this sort of thing anyway, belt and braces!
                            //nb. but we do do this even if the keyboard help dialog is currently present
                            //because the skip links and their content don't show in fullscreen mode
                            if
                            (
                                etc.def(player.autohiding)
                                &&
                                !player.media.paused
                            )
                            {
                                primeAutoHiding(player);
                            }


                            //update the video dimensions to match the screen
                            //nb. this will letterbox the video if the aspect ratio is different
                            //nb. I did consider setting video.width and height as well as
                            //style.width and height, so that it would work without CSS
                            //but then the controls and captions would no longer be visible
                            //without the CSS to overlay them on top of the fullscreen video
                            player.media.setSize(screen.width, screen.height);

                            //then update the controls form width to match
                            player.controlform.style.width = screen.width + 'px';

                            //if images are disabled, we need to re-update the
                            //dynamic widths of the seek and volume siders, since the
                            //change in font-size will have changed the widths of the button
                            //nb. the change in button text itself should usually do this
                            //but let's do it again anyway just to be sure it's up to date
                            if(!player.images)
                            {
                                updateSliderStretch(player);
                            }

                            //and then do the basically the same for the poster,
                            //except it won't automatically maintain the same aspect ratio
                            //so we have to do that manually using background size and position
                            //nb. any letterbox gaps will show the poster's default black background
                            if(player.poster)
                            {
                                var aspect = (aspect = button.videoheight / button.videowidth) < 1 ? aspect : (1 / aspect);
                                player.poster.style.backgroundSize = screen.width + 'px ' + (screen.width * aspect) + 'px';
                                player.poster.style.backgroundPosition = '0 ' + ((screen.height - (screen.width * aspect)) / 2) + 'px';
                            }


                            //the fullscreen tab handling we do for other browsers can't be allowed in firefox, IE11 or Edge
                            //because it prevents keyboard access to the fullscreen allow/deny dialog; so instead,
                            //we fall back on a more brutal technique, of removing every element from the tab order
                            //which is outside the player; this means that the tab focus can still move outside the player
                            //but only to system components (the active tab, address bar, and dialog if shown)
                            //and to the documentElement (which can't be prevented with tabindex, though we try anyway)
                            //or at least, that's what happens in Firefox, whereas in IE11 you can tab to the confirmation
                            //dialog, but once you've dismissed it the focus is now stuck inside the player (as we want)
                            //except that you can't cycle, ie. tab stops at the end buttons and you can only go the other way
                            //*** why is that? is there anything we can do about it?
                            if(defs.agent.firefox || defs.agent.ie11p || defs.agent.edge)
                            {
                                //so to do this we have to get the collection of all visible elements, and for every node
                                //that isn't inside the player, remember whether it had a tabindex attribute (for which
                                //we must check hasAttribute since the .tabIndex property returns -1 for all elements
                                //that aren't in the tab order, without differentating between those that have tabindex="-1"
                                //and that that have no tabindex at all) and then apply tabindex "-1" to remove it from the tab order
                                //nb. we record each existing tabindex as a private property of the node itself for simplicity,
                                //but using a long convoluted property name to avoid any probable conflict with existing properties
                                //nb. when firefox is being used with NVDA, some elements remain in the tab order even though they
                                //have tabindex -1 (eg. the transcript), but there doens't seem to be anyway of preventing that
                                //it must be internal heuristics that give rise to (what in this case is) unwanted behaviour
                                //nb. the concatenation is to avoid symbol compression
                                etc.each([_.documentElement, _.body].concat(etc.get('body '+'*')), function(node, i)
                                {
                                    if(!etc.contains(player.container, node))
                                    {
                                        node.__ozplayer_tabindex = node.hasAttribute('tabindex') ? node.getAttribute('tabindex') : null;

                                        node.setAttribute('tabindex', '-1');
                                    }
                                });
                            }
                        }


                        //else we need to restore the previous size
                        //nb. assuming that fullscreen is never on by default (which it never is)
                        //which means that we'll always have restoration data
                        else
                        {
                            //reset the screen permissions flag so it has to be evaluated again
                            //in case the user selected "deny and remember" in the confirmation prompt
                            screenpermission = false;


                            //remove the role and aria-modal
                            player.container.removeAttribute('role');
                            player.container.removeAttribute('aria-modal');

                            //remove the container fullscreen and large controls classes
                            //nb. the large controls class might not be present, but it's not
                            //worth explicitly checking for that since removeClass does that anyway
                            etc.removeClass(player.container, config.classes['container-fullscreen'] + ' ' + config.classes['large-controls']);

                            //then add the smallscreen or midscreen class as applicable to
                            //whether the previous video size was smaller than those thresholds
                            if(button.videowidth < config['smallscreen-threshold'])
                            {
                                etc.addClass(player.container, config.classes['smallscreen']);
                            }
                            else if(button.videowidth < config['midscreen-threshold'])
                            {
                                etc.addClass(player.container, config.classes['midscreen']);
                            }

                            //restore the previous video dimensions
                            player.media.setSize(button.videowidth, button.videoheight);

                            //reset the controls width
                            player.controlform.style.width = button.videowidth + 'px';

                            //if images are disabled, re-update the slider widths
                            //** do we need to do this here since we do it at the end anyway?
                            if(!player.images)
                            {
                                updateSliderStretch(player);
                            }

                            //reset the poster background size and position
                            if(player.poster)
                            {
                                player.poster.style.backgroundSize = button.videowidth + 'px ' + button.videoheight + 'px';
                                //nb. the escape is to avoid symbol compression
                                player.poster.style.backgroundPosition = '50%\ 0%';
                            }


                            //hide any button tooltip in case the fullscreen button
                            //tooltip is currently visible, otherwise its position
                            //far off to the right will cause a horizontal overflow
                            //nb. if you exited fullscreen by pressing the control button
                            //then its click handler will have already remove the tooltip
                            //however you might have pressed escape, or used a native mechanism
                            maybeRemoveButtonTooltip(player.controlform);

                            //if the controls options isn't already "stack"
                            //remove the container stack-controls class
                            if(player.options.controls != 'stack')
                            {
                                etc.removeClass(player.container, config.classes['stack-controls']);
                            }

                            //then if we've defined the autohiding management object
                            //and the media is currently playing
                            //nb. we do this in case you exit fullscreen by pressing the
                            //native escape key, which isn't handle by our events
                            //(presumably because it comes from outside the player)
                            if
                            (
                                etc.def(player.autohiding)
                                &&
                                !player.media.paused
                            )
                            {
                                //apply the showing state and define the auto-hiding
                                //and auto-showing events (if they haven't already been defined)
                                primeAutoHiding(player);
                            }


                            //remove all the tabindex attributes we added to enforce modality in firefox, ie11 and edge
                            //restoring the original tabindex attribute to those that already had one
                            //and then deleting the temporary node property we used to store its value
                            //nb. it would be faster to create a collection when we apply the tabindex
                            //but that would use more memory, so I think it's better not to in this case
                            //since this process doesn't really need to be especially fast, compared with
                            //the fact that video players by their very nature consume excessive memory
                            if(defs.agent.firefox || defs.agent.ie11p || defs.agent.edge)
                            {
                                //nb. the concatenation of the selector is to avoid symbol compression
                                etc.each([_.documentElement, _.body].concat(etc.get('body '+'*')), function(node, i)
                                {
                                    if(!etc.contains(player.container, node))
                                    {
                                        //nb. we have to check against undefined as well
                                        //else firefox applies a whole bunch of tabindex="undefined"
                                        //** though I don't understand why, since the hasAttribute('taindex')
                                        //** check should have created only null or defined values
                                        if(etc.def(node.__ozplayer_tabindex, null))
                                        {
                                            node.setAttribute('tabindex', node.__ozplayer_tabindex);
                                        }
                                        else
                                        {
                                            node.removeAttribute('tabindex');
                                        }
                                        delete node.__ozplayer_tabindex;
                                    }
                                });
                            }


                            //if the responsive layout is enabled
                            if(player.options.responsive)
                            {
                                //restore all the responsive events that we silenced when entering fullscreen
                                //nb. this will usually mean we get at least one additional resize event
                                //triggered almost immediately as the browser exits fullscreen mode
                                //which in some browsers might lead to another application of responsive adjustment
                                //and although that's rather redundant and inefficient, it's not enough to worry about
                                etc.each(player.responsivedata.responsiveevents, function(re)
                                {
                                    re.restore();
                                });

                                //then call the responsive handler even if we don't get a resize event
                                //nb. which we need for safari precisely because we don't get a resize event
                                //but without that the video fails to restore itself to responsive dimensions
                                //and since that can happen in safari, we should allow it to happen anywhere
                                //which is, again, rather inefficient and potentially redundant, but also very robust
                                //** but why is it doing that? why isn't using the pre-fullscreen dimensions?
                                doResponsiveEvent(player, 'screenexit');
                            }

                            //finally reset the screenplayer reference
                            screenplayer = null;
                        }

                        //then either way, re-apply the dynamic widths
                        //of the seek and volume field wrappers, so that
                        //they take up all the space inside the controls form
                        updateSliderStretch(player);

                        //then update the button state according to the fullscreen flag
                        updateControlState(player, 'fullscreen', (player.fullscreen ? 'on' : 'off'));

                        //set focus on the button so it's clearly inside the player
                        //and so that you can exit fullscreen by pressing enter again
                        //(although you can always do that natively by pressing escape)
                        player.controlform.fullscreen.focus();
                    },

                    //then define an abstraction for the button's command handler
                    '.ozcommand'      : function(e)
                    {
                        //reset the keyclick flag
                        player.keyclick = false;

                        //ignore this event if the button is disabled
                        if(player.controlform.fullscreen.disabled) { return false; }

                        //now get the current fullscreen state, then if we're in fullscreen
                        //nb. the screenchange event will fire for every player on the page
                        //that supports fullscreen, so we need to use the screenplayer flag
                        //to ensures that the event only responds to this player instance
                        //and that another player can't enter fullscreen in the meantime
                        //(ie. triggered from another player while this one is in fullscreen mode)
                        //nb. if we try to enter fullscreen mode when user permissions have already blocked it
                        //the screenchange event won't fire, which means that the screenplayer reference won't
                        //get reset and any subsequent attempt to enter fullscreen that session will be ignored
                        //we could reset it and make it check again every time, but that would be more complicated
                        //and maybe not entirely reliable ... I tried it in Firefox and the results were inconsistent
                        //so overall I reckoned it's simpler to stick with behaviour that's reliable and predictable
                        //(and which therefore means changing from "block" to "allow" will require a refresh to work)
                        if(library.isFullscreen(player.video, player.controlform.fullscreen.screentype))
                        {
                            //check that we have a fullscreen-player reference
                            if(screenplayer !== null)
                            {
                                //then exit fullscreen
                                library.leaveFullscreen(player.video, player.controlform.fullscreen.screentype);
                            }
                        }

                        //[else if we're not already in fullscreen]
                        else
                        {
                            //check that we don't already have a fullscreen-player reference
                            if(screenplayer === null)
                            {
                                //assign this player instance to the fullscreen-player reference
                                screenplayer = player;

                                //then if the responsive layout is enabled
                                if(player.options.responsive)
                                {
                                    //temporarily silence the responsive events before we enter fullscreen mode
                                    //otherwise the change in layout will trigger a resize that causes a conflicting response
                                    //and therefore we need to do it here because that would fire before the screenchange event
                                    etc.each(player.responsivedata.responsiveevents, function(re)
                                    {
                                        re.silence();
                                    });

                                    //however that's a problem if user permissions have already blocked fullscreen
                                    //because in that case we won't get a fullscreen event at all, and therefore nothing
                                    //to restore the events after exiting fullscreen again, so we need to check for that
                                    //possibility, and the only way to do that is to allow some time for it to have happened
                                    //nb. this timing can't be entirely robust because screenchange events are asynchronous
                                    //but in practise this seems to be long enough to be sure that an event hasn't occurred
                                    etc.delay(1000, function()
                                    {
                                        //then if the screenpermission flag is still false (having not been set by the screen event)
                                        if(!screenpermission)
                                        {
                                            //*** DEV MAYBE
                                            //updateControlDisabled(player, 'fullscreen', true);

                                            //restore all the responsive events that we silenced a moment ago
                                            etc.each(player.responsivedata.responsiveevents, function(re)
                                            {
                                                re.restore();
                                            });

                                            //then call the responsive handler in case the window size has changed in the meantime
                                            doResponsiveEvent(player, 'screenfail');
                                        }
                                    });
                                }



                                //*** DEV TMP ZOOM
                                //player.rescale = etc.listen(window, 'resize', function()
                                //{
                                //    var rescale = document.documentElement.clientWidth / screen.width;
                                //
                                //    console.log('rescale='+rescale);
                                //
                                //    if(rescale < 1)
                                //    {
                                //        player.container.style.webkitTransform = 'scale(' + rescale + ')';
                                //        player.container.style.webkitTransformOrigin = '50% 0';
                                //    }
                                //    else if(rescale > 1)
                                //    {
                                //        player.container.style.webkitTransform = 'scale(' + rescale + ')';
                                //        player.container.style.webkitTransformOrigin = '50% 50%';
                                //    }
                                //    else
                                //    {
                                //        player.container.style.webkitTransform = 'none';
                                //    }
                                //});


                                //record the wrapper dimensions before entering fullscreen
                                //saving them as properties of the button for convenience
                                //nb. we used to do this in the screenchange expand event
                                //but since ME4 that no longer returns the correct values
                                //neither the default size nor the final fullscreen size
                                //which means that the video doesn't expand to the correct size
                                //(it's slighty smaller than the screen size) and then retains
                                //that slightly-smaller large size when exiting fullscreen again
                                //I guess it's getting called during the screentype event itself
                                //like mid-way through the the fullscreen element being resized
                                //or something, I dunno, but whatever, if we record the
                                //dimensions before that happens then we get the right values
                                button = player.controlform.fullscreen;
                                button.videowidth = player.wrapper.offsetWidth;
                                button.videoheight = player.wrapper.offsetHeight;

                                //then enter fullscreen
                                library.enterFullscreen(player.video, player.container, player.controlform.fullscreen.screentype);
                            }
                        }

                        //nb. but don't update the button state yet, wait until
                        //the screenchange event, because until that fires
                        //we can't guarantee that it's actually happened at all
                        //although that does mean that the button won't ever
                        //update in iOS and Android, which have no screen event,
                        //but that doesn't actually matter since the only time
                        //you can see it is when it's in the "off" state anyway
                    }
                }
            );

            //in iOS the fullscreen function doesn't work until the video plays
            if(defs.agent.ios)
            {
                //so disable the button by default
                updateControlDisabled(player, 'fullscreen', true);

                //then bind a play event, with which we can re-enable it
                //and then we can silence the event since we won't need it again
                var screenbutton = etc.listen(player.video, 'play', function()
                {
                    screenbutton.silence();
                    updateControlDisabled(player, 'fullscreen', false);
                });
            }

            //bind the button's click handler to its command abstraction
            addControlClick(player, 'fullscreen');

            //then if we have a screen event, bind it to the button's screenchange abstraction
            if(screenevent)
            {
                etc.listen(document, screenevent, player.controlform.fullscreen.screenchange);
            }

            //else the webkit-video model doesn't have a screen event, but it does
            //have video events that fire when the video enters and exits fullscreen
            //so we can use those to maintain the screenplayer reference,
            //and to toggle the appearance of native captions, if supported
            else if(screentype == 'webkit-video')
            {
                //we may need to create a temporary textTracks change event when entering fullscreen
                //so create a reference for that which we can use when exiting again
                var ontrackchange = null;

                //when the video enters fullscreen mode
                etc.listen(player.video, 'webkitbeginfullscreen', function(e)
                {
                    //if the responsive layout is enabled
                    if(player.options.responsive)
                    {
                        //temporarily silence the responsive events
                        //nb. we need to do this again here even though we did it in the command function
                        //because devices which always use an external player (like iPhones) won't have
                        //fired the command function, since entering fullscreen is triggered by play;
                        //for others (like the iPad) this will be redundant, but it doesn't do any harm
                        etc.each(player.responsivedata.responsiveevents, function(re)
                        {
                            re.silence();
                        });
                    }

                    //set the screen permission flag so the responsive checks don't record failure
                    //(though the webkit-video model itself doesn't allow for fullscreen to be blocked)
                    screenpermission = true;

                    //set the screenplayer reference here, for extra safety even though
                    //our button will do that, just in case fullscreen was triggered externally
                    //nb. although we don't actually need this reference for the video model
                    //we do compare it with null to determine whether to enter fullscreen
                    //so we may as well update it the same as others, for internal consistency
                    screenplayer = player;

                    //then if we have captions data and native captions are supported,
                    //update any native track modes to match the enabled state and selection
                    //nb. if we didn't do this then there would never be fullscreen captions
                    //since the custom ones can't be shown in the video fullscreen model
                    if(player.tracks.captions && etc.def(player.video.textTracks))
                    {
                        //iterate through the caption tracks, and for each that has a native
                        //textTrack object, set the textTrack mode flag to "showing" if captions
                        //are enabled and its srclang matches the selected language, else "disabled"
                        //nb. it may not be necessary to set the non-showing track to disabled
                        //but it's better to be safe than sorry, since nothing else worked as expected!
                        //eg. there is a webkitClosedCaptionsVisible property, but it doesn't get
                        //updated when the native interface enables or disables native captions
                        //nb. we need a brief delay before doing this to make it work reliably in iOS7-9
                        //** although it does still fail sometimes (captions switch to "off" when entering fullscreen)
                        //** maybe it's because we set the mode flag from this event, which fires after entering fullscreen?
                        //** but if not that, how can we be sure in advance that entering fullscreen will actually happen?
                        //nnb. although it still doesn't update the native language menu selection,
                        //it does update the actual displayed captions, so that's good enough;
                        //the native language menu is generally kinda flaky in iOS7-9, eg. switching
                        //languages doesn't always work unless you select a different language first
                        //(or off) then the one you want; but there isn't anything we can do to fix that
                        etc.delay(function()
                        {
                            etc.each(player.video.textTracks, function(track)
                            {
                                track.mode =
                                    (player.tracks.captions.enabled && track.language == player.tracks.captions.selected.captions)
                                        ? 'showing'
                                        : 'disabled';
                            });

                            //bind a temporary change event to the textTracks object to handle native language changes
                            //so we can update the custom captions automatically for when you exit fullscreen again
                            //nb. we can't just check for mode differences when exiting fullscreen, because the
                            //native language menu selection doesn't get updated when we enter fullscreen in iOS,
                            //therefore if the user enters fullscreen and doesn't use the native language menu
                            //the exit modes will indicate that captions are off since that's what the menu would say
                            //even though captions are displayed and should remain displayed in that situation
                            //however if we monitor the change event then we can update tracks.captions from that
                            //nb. although the native language selection menu in iOS7-9 is flaky as noted earlier
                            //the change event does convey its actual functionality, ie. if selecting a language
                            //doesn't work then change doesn't fire, or if it selects the wrong language then the
                            //track modes conveys the language that it did actually select, which is what we want,
                            //since we can't fix the menu we can at least make our interface match its selections
                            //however a side-effect of this is that entering fullscreen sometimes switches captions off
                            ontrackchange = etc.listen(player.video.textTracks, 'change', function(e)
                            {
                                //*** DEV TMP
                                //var str = '#' + player.instance.id + '\nenabled = ' + player.tracks.captions.enabled + '\n' + 'selected captions = "' + player.tracks.captions.selected.captions + '"\n' + 'selected transcript = "' + player.tracks.captions.selected.captions + '"\n' + 'modes\n';
                                //etc.each(player.video.textTracks, function(track) { str += '"' + track.language + '" = "' + track.mode + '"\n'; });
                                //console.log(str);

                                //identify the new language selection by checking each of the mode flags
                                //ie. the new selection is the one to be "showing" rather than "disabled"
                                //or if none of them are showing then captions must have been switched off
                                var srclang = null;
                                etc.each(player.video.textTracks, function(track)
                                {
                                    if(track.mode == 'showing')
                                    {
                                        srclang = track.language;
                                        return false;
                                    }
                                });
                                if(!srclang)
                                {
                                    srclang = 'off';
                                }

                                //*** DEV TMP
                                //console.log('srclang = "' + srclang + '"');

                                //if we have multiple languages
                                if(player.tracks.captions.i18n)
                                {
                                    //select the specified language using the cc menu's selection function
                                    player.controlform['menu-cc'].selection(player.controlform['menu-cc'], srclang, e.type);
                                }

                                //else [if we only have one language]
                                else
                                {
                                    //set the cc enabled flag to the inverse of the expected setting
                                    //for the current value of srclang, ie. if srclang is "off"
                                    //then we're disabling captions so set the enabled flag to
                                    //true, ready for it to be inverted when we call cc command
                                    //nb. we can't just invert the current value of enabled
                                    //because the flakiness of the iOS7-9 language menu means
                                    //we might get concurrent events with the same setting
                                    player.tracks.captions.enabled = srclang == 'off';

                                    //then call cc command to invert that enabled state
                                    player.controlform.cc.ozcommand();
                                }
                            });
                        });
                    }
                });

                //when the video exits fullscreen mode
                //nb. in iOS<8 the video automatically pauses when jumping out of fullscreen
                //whereas Android 4 automatically plays when jumping in or out of fullscreen
                etc.listen(player.video, 'webkitendfullscreen', function(e)
                {
                    //reset the screen permissions flag
                    screenpermission = false;

                    //reset the screenplayer reference to null
                    //nb. if we didn't do this then it wouldn't be possible
                    //to enter fullscreen more than once per video/page session
                    //ie. you could enter, then exit, but not enter again before refresh
                    //which is exactly what caused that problem in v1.5 and earlier
                    screenplayer = null;

                    //then if we have captions data and native captions are supported,
                    //reset any native track modes to back to "disabled" to hide them
                    //(but only for ipad, so that iphone still shows playsinline captions)
                    //and stop monitoring for changes in native language selection
                    //(including iphone because playsinline has no language selection menu)
                    //*** check updated iOS for this, or maybe just make ontrackchange permanent for future proofing
                    if(player.tracks.captions && etc.def(player.video.textTracks))
                    {
                        //silence the textTracks change event
                        ontrackchange.silence();

                        //for ipad only
                        if(!defs.agent.iphone)
                        {
                            //set all the native textTrack mode flags in every instance to "disabled"
                            //nb. logically we should only have to do this for the current player instance
                            //however for some reason, enabling captions or switching language using the
                            //native menu in iOS fullscreen causes native captions to become enabled
                            //in all other instances as well (when multiple instances have captions),
                            //resulting in other instances showing both custom and native captions in non-fullscreen
                            etc.each(players, function(thetarget)
                            {
                                if(thetarget.tracks.captions && etc.def(thetarget.video.textTracks))
                                {
                                    etc.each(thetarget.video.textTracks, function(track)
                                    {
                                        track.mode = 'disabled';
                                    });
                                }
                            });
                        }
                    }

                    //if the responsive layout is enabled
                    if(player.options.responsive)
                    {
                        //restore all the responsive events that we silenced when entering fullscreen
                        etc.each(player.responsivedata.responsiveevents, function(re)
                        {
                            re.restore();
                        });

                        //then call the responsive handler for consistency and safety
                        doResponsiveEvent(player, 'videoexit');
                    }
                });
            }

            //then add it to the lastChild buttonkeys
            player.buttonkeys.lastChild.push('fullscreen');
        }


        //now add the last-field wrapper class to whichever is the last
        //(ie. right-most) field, which can be used to apply style variations
        //=> the fullscreen control is last, if it's present
        //=> otherwise volume is last, unless that's not there either
        //=> otherwise it goes: ad, cc, seek (right to left, in that order)
        //nb. the addClass opening bracket must be on the same line for function name compression
        etc.addClass(
            (
                player.controlform.fullscreen
                ||
                player.controlform.volume
                ||
                player.controlform.ad
                ||
                player.controlform.cc
                ||
                player.controlform.seek

            ).parentNode, config.classes['last-field-wrapper']);

        //then add the first-field wrapper class to the playpause field,
        //which is always very first (ie. left-most) field
        etc.addClass(player.controlform.playpause.parentNode, config.classes['first-field-wrapper']);


        //and now that we've created and added all the controls
        //apply dynamic widths to the seek and volume field wrappers,
        //so they proportionately take up all the remaining space
        updateSliderStretch(player);


        /*** DEV TMP (buttonkeyclick) ***//***
        player.konsole = etc.build('code',
        {
            '=after' : player.poster,
            '#style' :
            {
                'zIndex' : 4000,
                'display' : 'block',
                'position' : 'absolute',
                'left' : '40px',
                'top' : '40px',
                'border' : '2px solid white',
                'background' : '#003',
                'fontSize' : '11px',
                'width' : '500px',
                'height' : '250px',
                'overflow' : 'auto'
            }
        });
        function zeropad(n, length)
        {
            while((n = n.toString()).length < (length || 2))
            {
                n = '0' + n;
            }
            return n;
        }
        ***/
        /***
        etc.listen(player.container, 'keydown', function(e, thetarget)
        {
            player.konsole.innerHTML = 'KEYDOWN [' + zeropad(new Date().getMilliseconds(), 3) + '] ' + thetarget + '<br>' + player.konsole.innerHTML;
        });
        etc.listen(player.container, 'click', function(e, thetarget)
        {
            player.konsole.innerHTML = 'CLICK   [' + zeropad(new Date().getMilliseconds(), 3) + '] ' + thetarget + '<br>' + player.konsole.innerHTML;
        });
        ***/


        //define a flag for whether we're in windows high contrast, false by default
        player.whc = false;

        //now create and append an empty element with a specific background color (hot pink)
        //then read its computed backgroundColor and confirm that its rgb() matches
        //if it doesn't, then author colors have been overriden, and the most likely
        //reason for that is that a windows high contrast theme is in use; although
        //there might be another reason, such as user styling, which will then be
        //treated as high contrast, but I think that's probably a good thing anyway
        //nb. this will fail if the hc theme uses this exact shade of pink, but I mean, really?
        //just to be easily-cautious though, the color is slightly different from html "hotpink"
        //nb. this doesn't detect inverted/grayscale themes in Mac OS or Android, because they
        //don't actually change rendered colors, they just apply a filter to the overall display
        //but we don't need to cater for them anyway since they still display images
        //nb. this doesn't work in windows/chrome because it doesn't actually implement
        //windows hc themes, but then hc users won't be using chrome anyway, because of that
        var whc = etc.build('span',
        {
            '=parent' : player.container,
            '#style'  : { 'backgroundColor' : 'rgb(250,\ 100,\ 180)' }
        });
        if(etc.getStyle(whc, 'backgroundColor') != 'rgb(250,\ 100,\ 180)')
        {
            //set the whc flag
            player.whc = true;

            //set the images flag and add the no-images class
            player.images = false;
            etc.addClass(player.container, config.classes['no-images']);

            //udpate the slider wrappers with the new stable button sizes
            updateSliderStretch(player);

            //then if we have the logo-bug, negate its backgroundImage
            //which we have to do because Edge still displays background images
            //and then we'd get the image plus the alt text displayed on top of it
            //also Firefox displays data URIs even if images are explicitly blocked
            //nb. most browsers still display the poster too, but I think that's okay
            //I mean they still display the video and it's part of the video, so
            if(player.logo)
            {
                player.logo.style.backgroundImage = 'none';
            }
        }

        //either way, remove the test element
        player.container.removeChild(whc);

        //*** DEV TMP
        //console.warn('player.whc');
        //console.log(player.whc);


        //*** DEV TMP
        //etc.each(4, function(n)
        //{
        //    var span = etc.build('span',
        //    {
        //        '=parent'    : sliders[player.controlform.seek.id].track,
        //        'class'     : 'oz-timerange',
        //        '#style'    : { 'width' : '15%', 'left' : ((n * 20) + 5) + '%' }
        //    });
        //});


        //once we've done all that we can create the custom sliders
        //so first create the seek input, which is a "time" type slider
        //(ie. aria-valuetext and tooltip show the value converted to "mm:ss")
        //nb. the slider must have an ID for ARIA assignments, which is
        //why addMediaSlider requires an ID not an object reference
        addMediaSlider(player.controlform.seek, 'time');

        //now bind a slider seek index event, which fires whenever it's
        //updated by interaction on the slider or it's underlying input
        //but NOT when we dispatch slider events, otherwise we'd get
        //infinite recursion when we received and re-dispatched this event
        //nb. we can listen to the numeric "index" or the string "value"
        //but the former is always preferable because it's more efficient
        //nb. the callback is passed a data object, which contains the
        //"from" and "to" values and a reference to the "slider" object
        addMediaSliderEvent(player.controlform.seek, 'index', function(data)
        {
            //if the from and to values are the same, just ignore this event
            //nb. this will filter out the event that occurs on the seek
            //slider when refreshing its data with the media duration
            if(data.from == data.to) { return; }

            //nb. we were getting an occassional INVALID_STATE_ERR
            //when playing the video for the first time, but it didn't
            //make any difference to anything, so just silently handle it
            try
            {
                //remove the poster overlay if it's [still] present
                //nb. this can happen if preload=auto and you move the slider before first playback
                if(player.poster)
                {
                    player.poster = etc.remove(player.poster);
                }

                //also remove the video's poster attribute if it has one
                if(player.video.getAttribute('poster'))
                {
                    player.video.removeAttribute('poster');
                }

                //if the selected index is the highest slider index
                if(data.to == data.theslider.options.length - 1)
                {
                    //set the media time to its duration, so we jump to the end
                    //nb. we can't set the time higher than the duration, but the
                    //last slider member represents the modulus from timestep division
                    //and hence might be higher than the duration, so we have to max out
                    setMediaTime(player, player.media.duration);

                    //pause the media
                    pauseMedia(player, true);

                    //hide the loading indicator jic
                    hideIndicator(player);

                    //then update the button state
                    updateControlState(player, 'playpause', 'off');

                    //now set the player ended flag, so that the video will
                    //play from the beginning again next time you press play
                    //nb. this won't be enough to make that work if you seek to the end
                    //using this interface then play from the native interface
                    //but that doesn't really matter since it's an unlikely combination
                    player.ended = true;
                }

                //otherwise
                else
                {
                    //set the media to the time corresponding with this index
                    //(which we could get from its option value, but it's easier just to multiply by timestep)
                    //nb. we know that we'll have the duration value,
                    //because the slider wouldn't be enabled if we didn't
                    setMediaTime(player, data.to * player.controlform.seek.timestep);

                    //then set the ended flag to false, so that if you play to the end
                    //then seek to an earlier point, it will carry on playing from there
                    player.ended = false;
                }

                //maintain the seeking flag, which is set whenever you move the
                //slider manually or via the underyling control, then remains
                //true for as long as you keep doing that, and then for 250ms after
                //and this is used in the slider event dispatcher to avoid physical
                //resistence as it keeps trying to set the slider to the current time
                //rather than letting it move freely to the time you're seeking to
                //nb. 100ms was enough for most mouse interaction, but not for
                //iOS touch interaction, and in any case it has to be at least
                //as slow as the slider keyboard repeat rate, so that it remains
                //true all the time during continual slider repeating,
                //in any case, we can afford to be quite conservative,
                //since the slider only updates a maximum of once per second
                if(player.controlform.seek.unseeking)
                {
                    player.controlform.seek.unseeking = nullifyTimer(player.controlform.seek.unseeking);
                }
                player.controlform.seek.seeking = true;
                player.controlform.seek.unseeking = etc.delay(config['ke\y-repeat-delay'], function()
                {
                    player.controlform.seek.seeking = false;
                    player.controlform.seek.unseeking = nullifyTimer(player.controlform.seek.unseeking);

                });
            }
            catch(ex){}
        });


        ///then if the volume control is present
        if(player.controlform.volume)
        {
            //create the volume slider, which is a default "value" type slider
            //(ie. aria-valuetext and tooltip shows the literal value)
            addMediaSlider(player.controlform.volume, 'value');

            //now bind a slider volume index event
            addMediaSliderEvent(player.controlform.volume, 'index', function(data)
            {
                //pass the data.from and data.to values to the update volume abstraction
                //converting them from integer indices to the float from 0 to 1 we need
                //and passing false for the slider argument so we don't get a circular update
                updateVolume(player, data.from / 10, data.to / 10, false);
            });

            //then if we're using a third-party player, disable the volume and mute controls
            //and also the volume slider and thumb (including applicable disabled classes)
            //so that you can't change it until the default volume has been set
            //and remove the mute button's aria-label as it won't get enabled again
            //(see the progress/canplay re-enabling code for notes about that)
            //nb. this also stops displacement that happens in safari, whereby
            //if you click to the left of the thumb while the player is still connecting,
            //then the entire controls fieldset jumps a few pixels to the left!
            if(library.isThirdPartyMedia(player.mode))
            {
                etc.each(['mute','volume'], function(key)
                {
                    updateControlDisabled(player, key, true);

                    if(key == 'volume')
                    {
                        (key = sliders[player.controlform[key].id]).control.disabled = true;
                        key.thumb.disabled = true;
                        key.thumb.setAttribute('aria-disabled', 'true');
                        etc.addClass(key.container, config.classes['state-disabled']);
                    }
                    else
                    {
                        player.controlform[key].removeAttribute('aria-label');
                    }
                });
            }
        }


        //if the player offset width is already less than the smallscreen or midscreen threshold
        //(or the control form width if this is the audio-only player)
        //nb. now that we have the layout variations we need to handle smaller screens
        //we can do so by default even if we don't have a responsive container
        //nb. we need the wrapper offset width so it doesn't include the player borders
        //which gives us the same width value as was defined in the video width attribute
        //** what about the default width and height we sent to mediaelement for flash?
        //** it doesn't seem to matter now, but when we implement ways around the
        //** flash-of-too-large problem, that may well be one of the things we need to change
        var offsetWidth = player.isaudio ? player.controlform.offsetWidth : player.wrapper.offsetWidth;
        if(offsetWidth < config['midscreen-threshold'])
        {
            //*** DEV TMP
            //_.title = player.wrapper.nodeName + ' [!] ' + player.wrapper.offsetWidth;

            //add the smallscreen or midscreen class to the player container
            etc.addClass(player.container, offsetWidth < config['smallscreen-threshold'] ? config.classes['smallscreen'] : config.classes['midscreen']);

            //then update the slider stretch to compensate for the hidden controls
            updateSliderStretch(player);

            //restore the default (or user) volume, just in case the zeroing
            //of the volume slider's space causes it to be set to zero
            //nb. though there's no reason I know of why that should happen
            //but it did happen once ... though I'm not sure that was why
            //it might have been me who accidentally set it to zero, I can't
            //be sure, but neither can I allow that possibility to occur
            setMediaVolume(player, config['default-volume']);
        }

        //then if we do have a responsive container we can implement dynamic sizing
        if(player.options.responsive)
        {
            //create a responsive data object, with the default width and aspect ratio,
            //plus initially-zero dynamic properties for monitoring the difference
            //between the player and container widths, and for recording the last responsive
            //width we applied so that we can avoid repeatedly re-applying the same adjustment
            //we also need an object for storing references to the responsive events we'll use
            //nb. we need the wrapper offset width so it doesn't include the player borders
            //which gives us the same width value as was defined in the video width attribute
            //however the audio-only player has no wrapper width, so use the controlform width instead
            player.responsivedata =
            {
                playerwidth             : (player.isaudio ? player.controlform.offsetWidth : player.wrapper.offsetWidth),
                playeraspect            : player.wrapper.offsetHeight / player.wrapper.offsetWidth,
                responsivedifference    : 0,
                responsivewidth         : 0,
                responsiveevents        : {}
            };

            //*** DEV TMP
            //_.title = player.wrapper.nodeName + ' [=] ' + player.responsivedata.playerwidth;

            //now bind the primary event we need to maintain responsive size
            //and save its reference to the responsivedata object so we can
            //silence it later, which we'll need to do when entering fullscreen mode
            //(otherwise the change will trigger a resize that causes a conflicting response)
            //nb. resize catches window resize and most orientation changes
            player.responsivedata.responsiveevents.resize = etc.listen(window, 'resize', function(e)
            {
                //nb. in safari we get a jerky response from direct resize handling
                //which we can fix by adding a 10ms timeout before responding to it
                //however in most browsers that re-creates the very same jerkiness!
                //nnb. so the difference must be to do with when safari dispatches the event
                //such that the size is not yet stable when we come to respond to it
                //but in other browsers that just creates an extra response latency
                if(defs.agent.safari)
                {
                    etc.delay(function()
                    {
                        doResponsiveEvent(player, e.type);
                    });
                }
                else
                {
                    doResponsiveEvent(player, e.type);
                }
            });

            //we also add orientationchange for the iPad's benefit, because
            //it doesn't always reliably respond to zoom changes caused by rotation
            //not even always the initial zoom application that happens during page load
            //this also makes me more confident of a response in mobile devices in general
            //nb. although it does mean that most devices will fire both events
            //which is rather redundant and inefficient, but it can't be easily helped
            //(it could be helped, but not without tracking event flags, which is less reliable)
            player.responsivedata.responsiveevents.orientationchange = etc.listen(window, 'orientationchange', function(e)
            {
                doResponsiveEvent(player, e.type);
            });

            //then do it straight away in case the container is already smaller than the player
            doResponsiveEvent(player, 'default');
        }



        //~~ button tooltip events ~~//

        //define a flag to remember which button is currently showing a tooltip
        //nb. we define this as a property of the form for convenience
        //because slider instances don't have easy access to the player
        player.controlform.tooltipbutton = null;

        //now create a collection of all the elements we want with this behavior
        //starting with all the control buttons from the buttonkeys arrays
        //then adding each of the skip links which also need to have tooltips
        player.controlform.tooltipnodes = [];
        etc.each(player.buttonkeys, function(row)
        {
            etc.each(row, function(key)
            {
                player.controlform.tooltipnodes.push(player.controlform[key]);
            });
        });
        if(player.skiplinks)
        {
            etc.each(etc.get('a', player.skiplinks), function(link)
            {
                player.controlform.tooltipnodes.push(link);
            });
        }

        //iterate through the collection to define the button tooltip events
        etc.each(player.controlform.tooltipnodes, function(node)
        {
            //create a circular reference from the button to the form,
            //for consistency with the reference we have for sliders
            node.controlform = player.controlform;

            //then since the tooltips don't work in touch devices
            //we can save them some work by excluding ios and android
            //*** what about ios or android with a bluetooth keyboard
            //nb. but we still need the circular references
            if(defs.agent.ios || defs.agent.android) { return true; }

            //apply a button mouseover event to conditionally create and
            //show the tooltip, which we do for buttons even if it's disabled
            //passing the buffer flag so that it's delayed before appearing
            //nb. this caters for mouse but also touch events (for the most part)
            etc.listen(node, 'mouseover', function()
            {
                maybeCreateButtonTooltip(node, true);
            });

            //double that up with a button focus event to do the same thing from the keyboard
            //then start another timer to make it disappear after twice the hide buffer
            //so that it doesn't just stay there forever if the focus stays on the button
            //nb. since we fire this with the buffer, we can implement twice the buffer
            //simply by wrapping the call in an identical buffer timeout
            etc.listen(node, 'focus', function(e, button)
            {
                maybeCreateButtonTooltip(node, true, function()
                {
                    node.buffer = etc.delay(config['tooltip-hide-delay'], function()
                    {
                        maybeRemoveButtonTooltip(node.controlform, true);
                    });
                });
            });

            //then apply a button mouseout event to conditionally remove any current toolip
            etc.listen(node, 'mouseout', function()
            {
                if(node.name)
                {
                    maybeRemoveButtonTooltip(player.controlform, true);
                }
            });

            //and double that up with a button blur event,
            //to do the same thing from the keyboard, likewise
            //which also doesn't need to be qualified by any additional flags
            etc.listen(node, 'blur', function()
            {
                maybeRemoveButtonTooltip(player.controlform, true);
            });

            //finally add a generic document click event,
            //to instantly remove the current tooltip, likewise
            //and to do this even if the event came from the same button
            //so that clicking a button removes the tooltip instantly
            //nb. this differs from the slider tooltips which should appear
            //when you click the thumb to show where the time pointer is
            //whereas button tooltips are only useful to know what the button is
            //by the time you've clicked it it's no longer important information
            //not to mention that it saves the need to update the tooltip when
            //the button state changes, since the text would then be out of date
            //nb. this effectively means that touch devices won't even show the tooltips
            //since any mouseover and focus events they generate are countermanded by this
            etc.listen(document, 'click', function()
            {
                maybeRemoveButtonTooltip(player.controlform);
            });
        });



        //*** DEV TMP
        //var predump = etc.build('div',
        //{
        //    '=parent'    : player.container,
        //    '#style'    :
        //    {
        //        'position'    : 'absolute',
        //        'left'        : '20%',
        //        'top'        : '10px',
        //        'zIndex'    : '33000',
        //        'width'        : '56%',
        //        'height'    : '8em',
        //        'overflow'    : 'hidden',
        //        'padding'    : '8px',
        //        'background': '#eee',
        //        'color'        : '#666',
        //        'font'        : 'normal normal normal 11px/18px monaco,monospace'
        //    }
        //});
        //if(screentype === null)
        //{
        //    predump.innerHTML = 'FULLSCREEN NOT SUPPORTED';
        //}



        //*** DEV TMP
        //etc.listen(document, 'keydown', function(e, thetarget)
        //{
        //    var now = new Date(), stamp = (now.toGMTString()).split(/\s+2014\s+/)[1].replace(/(\s*(UTC|GMT))/i, '') + '.' + now.getMilliseconds();
        //    var tag = thetarget.nodeName.toLowerCase();
        //    if(thetarget.nodeType == 1)
        //    {
        //        tag = '&lt;' + tag;
        //        etc.each(thetarget.attributes,function(attr,i)
        //        {
        //            if(attr.specified)
        //            {
        //                tag += ' ' + attr.name + '="' + attr.value + '"';
        //            }
        //        });
        //        tag += '&gt;';
        //    }
        //    predump.innerHTML = '[' + stamp + ']('+e.keyCode+')<br>' + tag;
        //});



        //~~ global keyboard shortcuts ~~//

        //define a keyclick flag that denotes the keydown event
        //preceding a keyboard click event, which is then reset by
        //the keyup listener and by all the button command functions
        //see the keyup listener below for more notes about this
        player.keyclick = false;

        //define a repeating flag that we'll use to filter and control key-repeats
        player.repeating = false;

        //now bind a keydown handler to the player container, so we can
        //implement global keyboard shortcuts (eg. Space for play and pause)
        //and so we can handle Tab navigation when the player is in fullscreen mode
        //in order to enforce the modality that it should (but doesn't natively) have
        etc.listen(player.container, 'keydown', function(e, thetarget)
        {
            //if the repeating flag is true then block native repeats
            //using return null to prevent default and cancel bubble
            if(player.repeating) { return null; }

            //*** DEV TMP
            //var now = new Date(), stamp = (now.toGMTString()).split(/\s+2014\s+/)[1].replace(/(\s*(UTC|GMT))/i, '') + '.' + now.getMilliseconds();
            //_.title = '['+stamp+'] keyCode = ' + e.keyCode;

            //set the keyclick flag
            player.keyclick = true;

            //switch by evaluation
            switch(true)
            {
                //the Tab key is partly managed in fullscreen mode, in order to enforce its modality
                //nb. this prevents the user from being able to tab to unseen elements outside the fullscreen player
                //and largely replaces the original (and unreliable) approach of handling button focusin/out events
                //HOWEVER this approach has its own drawback in Firefox, IE11 and Edge, which is that preventing focus from
                //moving to system components means it's not possible to tab to the confirm/deny dialog that appears
                //if you haven't already set permission for this site to use fullscreen mode; it's not an issue in
                //other browsers because they either don't add those buttons to the tab order anyway (chrome)
                //or they don't present any such dialog (safari); but it is an issue in Firefox, IE11 and Edge,
                //and is significant enough that we can't allow it to happen unchecked, since it would mean
                //that sighted keyboard-only users have no way of dismissing that dialog (screenreaders users
                //wouldn't have the same problem because they still have spoken orientation information,
                //no different than if they weren't in fullscreen mode) so for those browsers, we have to avoid this,
                //and fall back on a more brutal solution of removing elements from the tab order which are
                //outside the player, which still allows system components to remain in the application tab order
                //nnb. a side-effect of this behaviour in IE11 is that Tabbing through the player controls no longer
                //cycles round at all, ie. tab stops at end buttons and can only go back the other way
                //*** why is that? is there anything we can do about it?
                case (e.keyCode == 9 && etc.contains(player.controlform, thetarget) && screentype !== null && !(defs.agent.firefox || defs.agent.ie11p || defs.agent.edge) && player.fullscreen) :

                    //*** DEV TMP
                    //var now = new Date(), stamp = (now.toGMTString()).split(/\s+2014\s+/)[1].replace(/(\s*(UTC|GMT))/i, '') + '.' + now.getMilliseconds();
                    //predump.innerHTML = '[' + stamp + ']'
                    //    + '<br>' + (e.shiftKey ? 'Shift+' : '') + 'Tab away from "' + thetarget.name + '"'
                    //    + '<br>' + 'player.fullscreen = ' + player.fullscreen;

                    //so if this is Tab from the fullscreen button, send focus back to
                    //the rewind button, then prevent its default and cancel bubble
                    if(!e.shiftKey && thetarget == player.controlform.fullscreen)
                    {
                        player.controlform.rewind.focus();
                        return null;
                    }

                    //else if this is Shift+Tab from the rewind button, send focus back to
                    //the fullscreen button, then prevent its default and cancel bubble
                    else if(e.shiftKey && thetarget == player.controlform.rewind)
                    {
                        player.controlform.fullscreen.focus();
                        return null;
                    }

                    break;
            }
        });

        //then bind a companion keyup to reset the repeating flag
        //and to implement some bits of extra browser tweaking
        etc.listen(player.container, 'keyup', function(e, thetarget)
        {
            //clear the repeating flag
            player.repeating = false;

            //cancel and nullify any key-repeat or repeat-delay timers
            player.__keydelay = nullifyTimer(player.__keydelay);
            player.__keyrepeat = nullifyTimer(player.__keyrepeat);

            //now reset the keyclick flag whatever happens
            player.keyclick = false;
        });



        //~~ global mouse shortcuts ~~//

        //bind a double-click event to the video, which triggers fullscreen mode
        //if we have a supported model, then prevents default and cancels bubble either way
        //nb. we need to prevent native double-click from putting the video into fullscreen
        //because that would just be the video, it wouldn't include custom captions and controls
        //nb. if you double-click the poster then firefox and chrome will start the video
        //and jump into fullscreen mode, but safari doesn't respond fast enough
        etc.listen(player.video, 'dblclick', function(e)
        {
            if(screentype !== null)
            {
                player.controlform.fullscreen.ozcommand(e);
            }
            return null;
        });



        //~~ reciprocal media events ~~//

        //bind an additional play event to maintain the button and audio states
        //in case the media is played from external events, eg. native controls
        //nb. but we can't use this event alone because the play event
        //doesn't fire until enough data has loaded to start playing
        etc.listen(player.media, 'play', function(e)
        {
            /*** DEV TMP COMMENTED OUT ***//***
            ***/
            //if we still have native controls (eg. on iOS) then remove them now
            //otherwise they'll appear whenever the focus is inside the player
            //(and on the ipad you'd see a little glow of them under the stack!)
            //however don't do that for the iphone, since iOS10 now includes the
            //ability for iphone videos to be embedded, and although default playback
            //still jumps to the external player, you can now exit fullscreen without
            //halting playback (there's an icon separate from "done" which does that)
            //so if we hid the controls, then exiting fullscreen would just show the
            //video frame with no controls, making it impossible to play or pause again
            //(which happens either from that icon or just from pressing "done")
            //and anyway we supports playsinline now so we need the native controls
            //because our custom controls are way too tiny to use on an iphone
            //or if we use large-controls then they'd take up way too much space
            //can't fucking win either way really, but that's because our controls
            //are bulkier and more visible in order to be more widely accessible
            //we could potentially design different controls for the iphone, but ...
            if(player.controlform && !defs.agent.iphone)
            {
                player.video.removeAttribute('controls');
            }

            //if playback has already ended then automatically reset to the start
            //nb. native implementations would do this anyway if playback ended naturally
            //but the flash player won't, and neither will native if we
            //forced the end point by manually seeking to the ended
            //nb. we have this code in both the play event and the playpause
            //command, to handle native and manual interaction respectively
            if(player.ended)
            {
                //set the time back to the beginning
                setMediaTime(player, 0);

                //also reset the seek slider so we don't have to wait for timeupdate
                //(which only comes every half a second in the flash player)
                //and this will also retrospectively update the seek control
                dispatchMediaSliderEvent(player.controlform.seek, 0);

                //if we have a scrolling transcript, reset it to the top
                if(player.transcript && player.transcript.offsetHeight < player.transcript.scrollHeight)
                {
                    player.transcript.scrollTop = 0;
                }

                //and then reset the player ended flag
                //nb. but we don't reset the started flag, because that
                //means the video has never been played, which it has now
                player.ended = false;
            }

            //update the button state
            updateControlState(player, 'playpause', 'on');

            //then if we have audio and the audio is paused, play that too
            //nb. we don't play audio in regular sync with video if we have xad data
            //because xad cues are handled differently (see xadTracking for details)
            if(player.audio && player.audio.paused)
            {
                if(!player.tracks.xad)
                {
                    player.audio.play();
                }
            }
        });

        //for the ipad, shore that up with a playing event
        //since we don't always get a play event on initial playback
        //(we used to, this must be related to the ME4 update)
        //and that would mean that the native controls are still present
        //and our custom play button hasn't updated its state
        if(defs.agent.ios && !defs.agent.iphone)
        {
            etc.listen(player.media, 'playing', function(e)
            {
                //if we still have native controls then remove them now
                //nb. it's possible we'll see the empty strip which used
                //to contain the native controls until they were removed
                //but that will disappear on its first inactivity fade
                //and won't ever appear again, so let's not worry about that
                //(and there's nothing we can do about it anyway, so whatevs)
                if(player.controlform)
                {
                    player.video.removeAttribute('controls');
                }

                //update the button state
                updateControlState(player, 'playpause', 'on');
            });
        }

        //do an equivalent thing for the pause event
        etc.listen(player.media, 'pause', function(e)
        {
            //update the button state
            updateControlState(player, 'playpause', 'off');

            //then if we have audio and the audio isn't paused, pause that too
            //nb. we don't play audio in regular sync with video if we have xad data
            //because xad cues are handled differently (see xadTracking for details)
            if(player.audio && !player.audio.paused)
            {
                if(!player.tracks.xad)
                {
                    player.audio.pause();
                }
            }

            //if we have xad data and an xad cue is currently playing
            //nb. there's no need to check the ready states
            //of the audio and xad data, because the playing flag
            //wouldn't be true unless all of that was already checked
            //nb. we only really need this condition for Safari, because other
            //browsers fire a timeupdate when pausing, which triggers a reset
            //from within xadTracking, but we may as well implement this for all
            //just in case of unpredictable browsers or situations that need it
            if(player.tracks.xad && player.audiodesk.xad.playing)
            {
                //stop any playing xad audio and reset xad tracking
                //setting lastcue to null so it can be selected again
                xadReset(player, null);

                //*** DEV TMP
                //console.error('PAUSE-RESET\n'
                //    + '\nplaying   = ' + player.audiodesk.xad.playing
                //    + '\nactivecue = ' + (player.audiodesk.xad.activecue ? ('["' + player.audiodesk.xad.activecue.id + '"]') : 'NULL')
                //    + '\nlastcue   = ' + (player.audiodesk.xad.lastcue ? ('["' + player.audiodesk.xad.lastcue.id + '"]') : 'NULL')
                //    + '');
            }

        }, false);

        //do an equivalent thing for the ended event
        //so that the media paused flag maintains a corresponding state
        //(ie. the flag is always true when the media is not playing)
        etc.listen(player.media, 'ended', function(e)
        {
            //set the player ended flag
            player.ended = true;

            //pause the media
            pauseMedia(player, true);

            //hide the loading indicator jic
            hideIndicator(player);

            //then update the button state
            updateControlState(player, 'playpause', 'off');

            //and move the seek slider to the end (unless the seeking flag is true)
            //nb. this is in case a long video has created a slider with
            //several seconds per step and the video duration doesn't match
            //an exact number of steps, in which case the seek slider would
            //finish on its penultimate physical step not the very last one
            //which is unlikely to be noticeable TBH since the difference is just
            //a few pixels, but it was noticeable when using a temporarily tiny (10)
            //seek-resolution for testing, and that's when it bugged me so I did this
            if(!player.controlform.seek.seeking)
            {
                dispatchMediaSliderEvent(player.controlform.seek, Math.ceil(player.media.currentTime));
            }
        });


        //do a similar thing for the volumechange event
        //nb. we have to be very careful to filter with the fakevolume flag
        //because if we didn't then we'd get infinite recursion, as the event
        //calls the setMediaVolume function, which then triggers another event
        //so the function sets the flag then we can ignore the events it caused
        //nnb. I didn't spot this as first! not until I found that the flash player
        //was using massive CPU and had stuttery playback, and this it what it
        //turned out to be, though interesting that it didn't happen natively
        //so the native implementations must have internal logic to prevent that
        etc.listen(player.media, 'volumechange', function(e)
        {
            //if this is not a fake volume change
            if(!player.fakevolume)
            {
                //define a local abstraction for this functionality
                function volumechange()
                {
                    //update the video and audio volume, also passing the muted flag
                    //so we can mute it if applicable instead of changing the volume
                    //(since muted audio doesn't return a zero volume)
                    //nb. we do this even if we don't have the volume control
                    //so that synchronised audio volume will still be maintained
                    setMediaVolume(player, player.media.volume, player.media.muted);

                    //if we have the mute control, update the button state
                    //passing a state array that defines the updated on/off state,
                    //as well as a high/low state corresponding with the updated volume
                    if(player.controlform.mute)
                    {
                        updateControlState(player, 'mute',
                        [
                            (player.media.muted ? 'on' : 'off'),
                            (player.media.volume < 0.5 ? 'low' : 'high')
                        ]);
                    }

                    //if we have the volume control, update the slider index
                    //either setting it to zero if the media is muted, else converting
                    //the volume to an integer in the volume slider's index range (0 - 10)
                    //nb. this will also update the value in the underlying input
                    if(player.controlform.volume)
                    {
                        dispatchMediaSliderEvent(player.controlform.volume, player.media.muted ? 0 : Math.round(player.media.volume * 10));
                    }
                }

                //now call the abstraction once straight away, then again after 200ms
                //nb. this account for the relatively high latency of volumechange events
                //we get from the native controls, which manifests as a failure to keep
                //up with the media volume if you move the native slider really quickly
                //and might be inherent to volumechange events, or just the native controls
                volumechange();
                etc.delay(200, volumechange);
            }
        });

        //setting the initial default volume usually fails in the youtube player,
        //so we have to do it again when canplay fires, at which point it's fine
        //however canplay doesn't fire with youtube in IE11, so we back it up with play
        //these events also enable the third-party volume slider that was disabled by default
        //nb. we don't get canplay in iOS, but it doesn't support player volume anyway
        //(and maybe there's an inherent correlation between those differences)
        if(library.isThirdPartyMedia(player.mode))
        {
            //so, we'll create an abstraction for what happens when it fires
            //then bind both events to that, and whichever one fires first will cancel them both
            var youtubecanplay, youtubeisplaying, youtubevolume = function(e)
            {
                //silence both events so this doesn't happen again
                youtubecanplay.silence();
                youtubeisplaying.silence();

                //if we have the mute and volume controls, they will have been
                //disabled by default, so re-enable the volume control and also
                //the volume slider and thumb (including applicable state classes)
                //but DON'T re-enable the mute button, because mute doesn't work
                //ie. you can press it once and it appears to mute because the volume
                //is set to zero, but if you click it again the sound never unmutes
                //(although you can still raise the slider and it's fine again)
                //but that's confusing, so just keep the mute button disabled
                //but we don't want to actually remove the button, partly because
                //I can't be arsed with the massive hassle, but mostly because
                //it still serves its purpose as a relative volume indicator
                if(player.controlform.volume)
                {
                    updateControlDisabled(player, 'volume', false);

                    var theslider = sliders[player.controlform.volume.id];
                    theslider.control.disabled = false;
                    theslider.thumb.disabled = false;
                    theslider.thumb.setAttribute('aria-disabled', 'false');
                    etc.removeClass(theslider.container, config.classes['state-disabled']);
                }

                //set the video and audio default volume
                setMediaVolume(player, config['default-volume']);

                //if we have the mute control, update the button state
                //passing a state array that defines the updated on/off state,
                //as well as a high/low state corresponding with the updated volume
                if(player.controlform.mute)
                {
                    updateControlState(player, 'mute',
                    [
                        (player.media.muted ? 'on' : 'off'),
                        (player.media.volume < 0.5 ? 'low' : 'high')
                    ]);
                }

                //if we have the volume control, update the slider index
                //either setting it to zero if the media is muted, else converting
                //the volume to an integer in the volume slider's index range (0 - 10)
                //nb. this will also update the value in the underlying input
                if(player.controlform.volume)
                {
                    dispatchMediaSliderEvent(player.controlform.volume, player.media.muted ? 0 : Math.round(player.media.volume * 10));
                }
            };

            //bind the two events
            youtubecanplay = etc.listen(player.media, 'canplay', youtubevolume);
            youtubeisplaying = etc.listen(player.media, 'play', youtubevolume);
        }


        //also bind an error event listener, which will fire soon after you press play
        //if the media sources failed to load (eg. because of 404s), so if that happens
        player.erroneous = etc.listen(player.media, 'error', function(e)
        {
            //*** DEV TMP
            //console.warn('media error');
            //console.log(e);

            //abort media playback and progress monitoring and show the timeout indicator
            //passing the false flag because we don't need to explicitly pause the media
            abortMedia(player, false);
        });



        //~~ callback events ~~//

        //wtaf ... why is this is necessary again??
        //but without it we don't get first-play in youtube
        etc.listen(player.media, 'play', function(){});

        //youtube videos fire a play event after every seek, and the player
        //doesn't report seek events to filter this with, but we can maintain
        //this playfilter flag and update it in response to play vs other events
        //so that we only report play events when the video is not already playing
        player.playfilter = false;

        //add registered events to call addListener callbacks
        //** how come we don't have the play/playing problem in iOS?
        //** could that problem have been related to the wtaf with play events?
        etc.each(defs.events, function(a)
        {
            etc.listen(player.media, a, function(e)
            {
                //don't call play callbacks if the video is already playing
                if(e.type == 'play' && player.playfilter) { return; }

                //don't call pause callbacks if currentTime matches duration
                //because native, flash and vimeo fire a pause event before ended
                //so this filters them out to avoid redundant pause callbacks
                //however we have to floor the numbers to avoid floating point
                //discrepancies in flash and vimeo, which does mean that we wouldn't
                //get a pause event if the user pressed pause within that fraction
                //of a second from the end, but how likely is that, really?
                //nnb. using floor in case the discrepancies are either side of 0.5
                if(e.type == 'pause' && Math.floor(player.media.currentTime) == Math.floor(player.media.duration)) { return; }

                //[else] fire the event callback(s) for this event
                doEventCallback(player, e.type);

                //update the playfilter flag
                player.playfilter = e.type == 'play';

            }, false);
        });



        //~~ media timing and synchronisation ~~//

        //bind a media timeupdate event, to:
        //=> keep the seek slider updated
        //=> manage and display the captions, if applicable
        //=> synchronise the audio, if applicable
        etc.listen(player.media, 'timeupdate', function(e)
        {
            //get the media's currentTime quantized to the seek slider's timestep
            var time = Math.ceil(player.media.currentTime / player.controlform.seek.timestep);

            //*** DEV TMP
            //_.title = '['+player.media.currentTime.toFixed(2)+'] = ' + (time * player.controlform.seek.timestep);

            //then if the current seek value doesn't represent that time
            //(which is the simplest way of referencing the slider's selected value)
            //nb. we must use loose equality here to compare a string with a number
            if(player.controlform.seek.value != (time * player.controlform.seek.timestep))
            {
                //don't do this if the slider is currently seeking, otherwise we'll get
                //physical resistence as it keeps trying to set the slider to the current time
                //rather than letting it move freely to the time you're seeking to
                if(!player.controlform.seek.seeking)
                {
                    //dispatch a seek slider event to update it to this time
                    //which will also retrospectively update the seek control
                    dispatchMediaSliderEvent(player.controlform.seek, time);
                }

                //*** DEV TMP
                ////_.title = '['+player.media.currentTime.toFixed(2)+'] = ' + (time * player.controlform.seek.timestep);
                //_.title += '  ('+player.controlform.seek.value+')';
            }


            //if we have any captions
            if(player.tracks.captions)
            {
                //*** DEV TMP
                //_.title = '['+library.getTimeStamp(player.media.currentTime)+'] => [data-cue="'+player.captions.getAttribute('data-cue')+'"]';

                //if this is not an iphone captions are enabled and the caption-selected
                //track's readyState is 4 (which means they've been loaded and parsed)
                //nb. custom captions aren't shown on the iphone because they
                //can't be controlled without the custom interface, so it always
                //shows native <track> captions for playsinline or full-screen
                if
                (
                    !defs.agent.iphone
                    &&
                    player.tracks.captions.enabled
                    &&
                    player.tracks.captions[player.tracks.captions.selected.captions].readyState == 4
                )
                {
                    //update the captions container to match the currentTime
                    //either adding or replacing the cue that corresponds with the time
                    //or removing any existing cue if there isn't one for the time
                    //using the cues array defined for the selected captions language
                    //nb. if the timing of the very last cue equals or exceeds the
                    //video duration, then when the video ends that very last caption
                    //will remained displayed; I did consider changing that, like this:
                    //displayCaption(player, player.media.currentTime < player.media.duration ? player.media.currentTime : Infinity);
                    //but then I thought, actually that's not the right thing to do
                    //what if an author wants the caption to remain displayed in that case?
                    //and after all, they can prevent it by changing the cue's end time
                    displayCaption(player, player.media.currentTime);
                }

                //if we have a transcript and the transcript-selected track's readyState is 4
                //nb. we still do this for iphone so you can see it with playsinline
                if
                (
                    player.transcript
                    &&
                    player.tracks.captions[player.tracks.captions.selected.transcript].readyState == 4
                )
                {
                    //update the transcript cue markers to match the currentTime, either
                    //adding or replacing the markers for the cue that corrresponds with the time
                    //or removing any existing markers if there isn't a cue for that time
                    //using the cues array defined for the selected transcript language
                    displayTranscriptMarkers(player, player.media.currentTime);
                }
            }


            //if we have enabled audio descriptions, synchronise the audio with the video
            //nb. we don't bother synchronising while they're disabled
            //because they're also muted, so we can reduce the player's work
            if(player.audio && player.audiodesk.enabled)
            {
                //if we have xad data then call the xadTracking function
                //nb. we don't play audio in regular sync with video if we have xad data
                //because xad cues are handled differently (see xadTracking for details)
                if(player.tracks.xad)
                {
                    xadTracking(player, player.media.currentTime);
                }

                //however in safari and opera syncing the audio causes momentarily loss of sound
                //so if we synchronise continually then the descriptions will never be heard
                //while in firefox continual synchronising causes a jittery aliased sound
                //but we can't just not sync at all, so instead we record the media time
                //each time we sync, and then compare that saved time with the current time
                //then only synchronise if the modulus of that division is zero and the sync and
                //lastsync are not the same, which effectively means 1 synchronisation every x seconds
                //(where x is the config sync-frequency value, which defaults to 9s)
                //nb. we also bolster this with additional sync calls from the play and seeked events,
                //and from setMediaTime, and from the events that control the loading indicator,
                //and from the audio's own loading and buffering events where applicable
                //so that interruptions or changes in playback state always trigger re-synchronisation
                //** I wonder if there's anyway we could use the web audio api to monitor
                //** the output sound, and then only synchronise when the audio is silent
                //*** why are safari and opera always slightly out of sync??
                //*** even straight after synchronisation they can be up to 1s late
                //*** although that only seems to happen while the media is loading
                //*** once the video and audio have loaded synchronisation is much better
                //*** but that doens't really make sense; I've also noticed that when you
                //*** seek forwards in safari from a loaded region to an unloaded region
                //*** the video's audio continues to sound in the background until seeked
                //*** so maybe that's related to whatever the fuck is going here?
                else
                {
                    var sync = Math.floor(player.media.currentTime);
                    if(sync % config['sync-frequency'] == 0 && sync != player.audiodesk.lastsync)
                    {
                        audioSynchronise(player);
                    }
                }
            }

        });

        //if we have audio descriptions
        if(player.audio)
        {
            //we need to bolster the reduced frequency of audio timeupdate synchronisation
            //by doing another synchronisation every time a play event occurs
            etc.listen(player.media, 'play', function(e)
            {
                if(player.audiodesk.enabled)
                {
                    audioSynchronise(player);
                }
            });

            //we also need to do the same thing in response to seeked events
            //however we can't rely on the currentTime value we get from that event
            //eg. in Firefox with Flash it reports the previous position not the new one
            //but what we can do is use that event to bind an additional timeupdate sync
            //because the subsequent timeupdate event we get will have the correct time
            //however we can't set the audio waiting state in between because that would
            //interfere with cases where seeking needed to trigger additional loading,
            //causing the AD to start playing again even though it should be waiting,
            //so it's possible we'll get a brief snatch of unsynced sound in between
            etc.listen(player.media, 'seeked', function(e)
            {
                if(player.audiodesk.enabled)
                {
                    var seeksync = etc.listen(player.media, 'timeupdate', function(e)
                    {
                        seeksync.silence();

                        audioSynchronise(player);
                    });
                }
            });
        }



        //~~ media loading and buffering (and associated synchronisation) ~~//

        //bind a media first-play event to update the started state
        //nb. we need a custom started flag for this state, instead of just
        //evaluating duration and currentTime, because it's possible to press
        //play and then pause again before even the metadata has loaded
        //nnb. but we can't just silence() this event after firing, because
        //... erm ... it sometimes fires more than once despite these conditions
        //in circumstances I can't remember but which turned out to be necessary
        //or something, I can't exactly remember, maybe it's just superstition!
        etc.listen(player.media, 'play', function(e)
        {
            //check that the media hasn't already started
            //in case another process starts the buffer before we get to this
            //(which afaik can only happen with autoplay, but let's be on the safe side)
            if(isNaN(player.media.duration) || player.media.duration == 0 || !player.started)
            {
                //if the playpause button is still disabled, enable it now
                //eg. in some circumstances it has to be disabled by default in iOS
                if(player.controlform.playpause.disabled)
                {
                    updateControlDisabled(player, 'playpause', false);
                }

                //then if this is a third-party player set focus on the playpause button
                //which we do to avoid a keyboard trap when the plugin object is an iframe,
                //ie. clicking the youtube play icon sets focus in the iframe document
                //and you can't tab to escape, you have to click outside it again
                //so focusing the play button effectively pulls it back into this document
                //(and seems like the most coherent and sensible place to put the focus)
                //** but the same thing will happen if you click to dismiss ads inside the frame
                //** and I don't see what we can do about that, since we can't just keep
                //** moving the focus back on response to video events, that solution would be
                //** worse than the original problem, so how can we detect it happening?
                //** maybe some kind of generic "focus has left this document"?
                if(library.isThirdPartyMedia(player.mode))
                {
                    player.controlform.playpause.focus();
                }

                //finally set the started flag
                //nb. as well as being a safety condition for this event
                player.started = true;
            }

        }, false);

        //bind a set of monitoring events to update the buffer info
        //and initialise the seek slider once the video duration is known
        //nb. we need to include both "progress" and "loadedmetadata" events
        //because a change in the reported duration doesn't trigger "progress"
        //and the flash version doesn't implement the "durationchange" event
        //although we do still need "durationchange" as well because
        //Android always reports a duration of 1 with "loadedmetadata"
        //which doesn't get updated until the video starts to play
        //nnb. originally I used "canplay" instead of "loadedmetadata"
        //but that wasn't reliable in the flash version either, while
        //nb. using "timeupdate" fills the gaps left by erratic progress events
        //(ie. whether or not we get them is erratic in IE10+, flash and native youtube)
        etc.each(player.progressevents = { 'loadedmetadata' : null, 'progress' : null, 'timeupdate' : null, 'durationchange' : null }, function(handler, type)
        {
            player.progressevents[type] = etc.listen(player.media, type, function(e)
            {
                //*** DEV TMP
                //return;

                //as soon as the video duration is available
                //nb. native video returns NaN until the duration is
                //available, while the flash fallback player returns zero;
                //Android fires durationchange immediately after loadstart
                //but the duration it returns is always 1, irrespective of the
                //actual video duration and even if it the file path is broken,
                //Android may also return a duration of Infinity in the first
                //loadedmetadata and progress events; so we have to allow for those
                //cases and rely on subsequent events to get the correct duration
                //(which may not come until the first timeupdate, but that'll do)
                //nnb. although we won't get durationchange events for the
                //youtube player, we will get progress events to do the same job
                if
                (
                    !isNaN(player.media.duration)
                    &&
                    player.media.duration > 1
                    &&
                    player.media.duration != Infinity
                )
                {
                    //also silence the error event, just in case it fires erroneously
                    //(though I can't remember why that could happen, I remember it did!)
                    player.erroneous.silence();

                    //then if the seek slider still has a range max of zero
                    //(which means it hasn't been udpated since it was created)
                    //refresh the seek controls's data, now that we know the duration
                    //(which will update the control and then refresh the custom slider)
                    //UNLESS the playpause button is still disabled; this can happen
                    //if preload=auto and you move the slider before first playback
                    //however several browser/OS combinations don't allow playback
                    //until other conditions have been met, and so we shouldn't allow
                    //seeking before then since it would be useless (you would seek
                    //further ahead, but the video won't necessarily show, and then
                    //when you do press play it would start from zero anyway)
                    if(sliders[player.controlform.seek.id].range.max == 0 && !player.controlform['playpause'].disabled)
                    {
                        refreshSeekData(player);
                    }
                }


                //nb. we do this next stuff whether or not we know the duration
                //even though though we use that data in buffer evaluations
                //(since if duration is NaN or zero then the buffer will inevitably be empty)
                //and we need to do this even if it is, in case you press play
                //at the start and then pause again before any data has loaded
                //but it's inefficient to do this for the timeupdate event
                //in the native implementation, since it fires reliabele progress events
                //if applicable, or if the whole video is already cached then loadedmetadata
                //will have the full buffer info; however progress events won't fire with flash
                //or with native youtube, which only fires timeupdate events during playback loading
                //apart from isolated progress events which fire after seeking to a new portion
                //and in safari7 with flash youtube where the expected progress events are fired after all
                //(but we won't add an execption for that because it's better to be safe than sorry!)
                if(e.type == 'timeupdate' && player.mode == 'native')
                {
                    return;
                }


                //now get the video buffer time-ranges data
                var buffer = getBufferData(player.media);

                //if we don't already have a range container inside the track, add it now
                //nb. we need this so we can add and remove nodes without having to
                //account for the presence of other slider nodes in the same parent
                var track = sliders[player.controlform.seek.id].track;
                if(!track.ranges)
                {
                    track.ranges = etc.build('span',
                    {
                        '=parent'     : track
                    });
                }

                //then get the collection of time-range spans inside the ranges container
                //nb. don't use etc.get for this because we need a live collection
                var spans = track.ranges.getElementsByTagName('span');

                //and then add or remove time range spans until we have
                //the same number of spans as buffer time ranges
                while(spans.length < buffer.length)
                {
                    etc.build('span',
                    {
                        '=parent'    : track.ranges,
                        'class'     : config.classes['buffer-time-range']
                    });
                }
                while(spans.length > buffer.length)
                {
                    etc.remove(track.ranges.lastChild);
                }

                //now run through the buffer and apply the width and position of each
                //nb. apply them as percentage values so we don't have to resize for fullscreen
                //rounding the percentages because we don't need greater precision than that
                etc.each(buffer, function(range, i)
                {
                    //nb. check that they're not both zero, which can happen in the flash player
                    if(range[1] > range[0])
                    {
                        spans[i].style.left = Math.round
                        (
                            (100 / player.media.duration) //the width of 1s
                            *
                            range[0]
                        )
                        + '%';

                        spans[i].style.width = Math.round
                        (
                            (100 / player.media.duration) //the width of 1s
                            *
                            (range[1] - range[0])
                        )
                        + '%';
                    }
                });
            });
        });


        //now bind a set of monitoring events to maintain the loading indicator
        //starting with a pair of waiting/canplay events which modern native
        //implementations fire whenever the video has the wait while loading
        //nb. the "stalled" event is buggy in safari 7, firing at times when
        //the media hasn't started to attempt loading yet, or when it's already
        //loading fine (both happened when testing with 3G bandwidth throttling)
        //none of which is especially significant since we're not using that event
        //but it's worth noting that we can't, because of its bugging behaviour
        //similarly, we can't ue the "suspend" event it makes no sense at all!
        //nb. there's also a canplaythrough event which should fire when enough
        //media has loaded for uninterrupted playback from here to the end
        //but it's not reliable at all because of wide browser differences
        //eg. in chrome it's the same as canplay, in safari it never fires,
        //only IE11 and Firefox appear to interpret this event correctly
        etc.listen(player.media, 'waiting', function(e)
        {
            //ignore this event if the video is not playing, because
            //there's no point showing the indicator for background loading
            //nb. waiting shouldn't fire while paused, but just in case
            //also don't do this if the media playback rate is zero, which caters
            //for android when playing an xad audio cue, because the video seek
            //we do at the start of the cue also triggers a waiting event
            if(player.media.paused || Math.round(player.media.playbackRate) < 1)
            {
                return true;
            }

            /*** DEV LOG (show indicator) ***//*
            if($this.logs.video && player.indicator.icontype === null)
            {
                videolog([[e.type.toUpperCase(), 18],['',26],['SHOW', 0]],['<dfn>','</dfn>']);
            } */

            //show the indicator while waiting
            showIndicator(player, 'loading');

            //if we have audio descriptions (whether or not they're enabled)
            if(player.audio)
            {
                //set the audio waiting flag
                player.audiodesk.waiting = true;

                /*** DEV LOG (audio wait) ***//*
                if($this.logs.audio)
                {
                    audiolog([['AUDIO-WAIT', 18],['',26],['WAIT', 0]],['<dfn>','</dfn>']);
                } */

                //then if audio descriptions are enabled
                if(player.audiodesk.enabled)
                {
                    //mute the audio while we're waiting
                    player.audio.muted = true;
                }
            }
        });
        etc.listen(player.media, 'canplay', function(e)
        {
            //ignore this event if the video is not playing, because
            //there's no point showing the indicator for background loading
            if(player.media.paused)
            {
                return true;
            }

            /*** DEV LOG (hide indicator) ***//*
            if($this.logs.video && player.indicator.icontype === 'loading')
            {
                videolog([[e.type.toUpperCase(), 18],['',26],['HIDE', 0]],['<dfn>','</dfn>']);
            } */

            //hide the indicator now playback can resume
            hideIndicator(player);

            //if we have audio descriptions (whether or not they're enabled)
            if(player.audio)
            {
                //reset the audio waiting flag
                player.audiodesk.waiting = false;

                /*** DEV LOG (audio wait) ***//*
                if($this.logs.audio)
                {
                    audiolog([['AUDIO-WAIT', 18],['',26],['GOOD', 0]],['<dfn>','</dfn>']);
                } */

                //then if audio descriptions are enabled
                if(player.audiodesk.enabled)
                {
                    //synchronise the audio with the video
                    audioSynchronise(player);

                    //unmute the audio unless the media is also muted
                    player.audio.muted = player.media.muted;
                }
            }
        });

        //however those events are only reliable in modern native implementations
        //the flash player only report a single canplay event, at the start
        //we don't get subsequent waiting/canplay when seeking triggers loading
        //however we can monitor other media events to know when to show the loading
        //spinner, by checking whether current time is inside a loaded time range
        //but we do this for all, not just for flash, because it allows for browser quirks
        //such as native implementations that don't fire enough waiting/canplay events (eg. IE11 and Edge)
        //and for low-bandwidth situations where the video might freeze while loading data
        //even though checking the buffer shows that the time is inside a loaded range
        //and there are two different ways a browser might respond: either continuing to fire
        //timeupdate events with the same currentTime, or not firing timeupdate events while frozen,
        //and this difference in behaviour determines which event we have to use for monitoring:
        //=> progress is used for those that freeze without firing timeupdate (chrome, opera)
        //=> timeupdate is used for those that keep firing same-time timeupdate (IE, Edge, firefox flash)
        //   (and with flash we can't rely on the existence of progress events anyway)
        //=> safari is really weird, jumping in a kind of loop when video freezes, eg. going from
        //   25 to 26 to 27 back to 25, and so on for as long as the freeze state persists
        //   and using timeupdate for this sometimes appeared to lock that into an unescapable cycle
        //   not really sure what's going on there, but using progress works better and feels safer
        //   though it still doesn't exactly work brilliantly in safari, it's better than nothing
        //=> ipad safari just pauses if it doesn't have enough bandwidth! and I don't think there's
        //   anything I can do to fix that, but the rest of the time it seems better with progress
        //   though since ios doesn't have audio descriptions its loading indication isn't as important
        //however, we can't rely on progress events in native/firefox < 35 because the timerange data
        //they provide is often badly wrong, eg. in Firefox 10 the first time range could be
        //something like [18446744073.71,0.3] while in Firefox 34 it could be [-3000,-2999.53]
        //in the former case, seeking forward will create additional accurate time ranges
        //but in the latter case, seeking forward won't create any more ranges, it will simply
        //keep firing progress events with the first range, even though it obviously does keep
        //loading new data, since playback works fine and seek waiting/canplay combinations do fire
        //and this would mean that the loading indicator continues to show until playback is paused
        //but since waiting/canplay are reliable in firefox we can rely on them for the loading indicator
        //since they fire in all cases of loading, including those cases where playback is frozen
        //(although of course we won't get accurate buffer info in the controls in those older firefox)
        //there's a similar problem in native/youtube with firefox < 35 except that we don't get
        //canplay/waiting events either, so we just have to make do without the custom loading indicator
        //and rely on the fact that youtube's API provides its own loading indication when necessary
        //(which means we still won't get accurate loading information in the player interface)
        //nb. there's no point doing this for third-party media sources like youtube or facebook
        //since they manage buffering in their API and have their own indicators for that anyway
        //nb. in android 4.1 we don't get any buffer data at all until the entire video has loaded
        //no progress events fire, and the timeupdate events simply have [0,0] in their buffer data
        //with the result that the loading indicator would show continually during initial playback
        //disappearing only when the whole video has loaded and the buffer now has a [0,duration] range
        //(at which point we start getting continual progress events with the same single range)
        //nb. there's also no point doing this for the iphone, since you wouldn't see it
        //but we do need to do it for the ipad since iOS(8) doesn't fire the necessary waiting/canplay events
        if(!((defs.agent.firefox && player.mode == 'native') || library.isThirdPartyMedia(player.mode) || defs.agent.android || defs.agent.iphone))
        {
            etc.listen(player.media, (defs.agent.ie || defs.agent.edge || defs.agent.firefox ? 'timeupdate' : 'progress'), function(e)
            {
                //ignore this event if the video is not playing, because
                //there's no point showing the indicator for background loading
                //nb. and timeupdate can still fire while paused, eg. during seeking
                if(player.media.paused)
                {
                    return true;
                }

                //if the indicator is not showing and the current time is not buffered
                if(player.indicator.icontype === null && !isTimeBuffered(player.media))
                {
                    /*** DEV LOG (show indicator) ***//*
                    if($this.logs.video)
                    {
                        videolog([[e.type.toUpperCase(), 18],['',26],['SHOW', 0]],['<dfn>','</dfn>']);
                    } */

                    //show indicator while loading
                    showIndicator(player, 'loading');

                    //if we have audio descriptions (whether or not they're enabled)
                    if(player.audio)
                    {
                        //set the audio waiting flag
                        player.audiodesk.waiting = true;

                        /*** DEV LOG (audio wait) ***//*
                        if($this.logs.audio)
                        {
                            audiolog([['AUDIO-WAIT', 18],['',26],['WAIT', 0]],['<dfn>','</dfn>']);
                        } */

                        //then if audio descriptions are enabled
                        if(player.audiodesk.enabled)
                        {
                            //mute the audio while we're waiting
                            player.audio.muted = true;
                        }
                    }
                }

                //if the indicator is showing and the current time is buffered
                if(player.indicator.icontype === 'loading' && isTimeBuffered(player.media))
                {
                    /*** DEV LOG (hide indicator) ***//*
                    if($this.logs.video)
                    {
                        videolog([[e.type.toUpperCase(), 18],['',26],['HIDE', 0]],['<dfn>','</dfn>']);
                    } */

                    //hide indicator after loading
                    hideIndicator(player);

                    //if we have audio descriptions (whether or not they're enabled)
                    if(player.audio)
                    {
                        //reset the audio waiting flag
                        player.audiodesk.waiting = false;

                        /*** DEV LOG (audio wait) ***//*
                        if($this.logs.audio)
                        {
                            audiolog([['AUDIO-WAIT', 18],['',26],['GOOD', 0]],['<dfn>','</dfn>']);
                        } */

                        //then if audio descriptions are enabled
                        if(player.audiodesk.enabled)
                        {
                            //synchronise the audio with the video
                            audioSynchronise(player);

                            //unmute the audio unless the media is also muted
                            player.audio.muted = player.media.muted;
                        }
                    }
                }
            });
        }

        //nb. since we don't show the indicator while the video is not playing
        //we should therefore explicitly hide it if it's visible when paused
        //although the playpause command already does this, we still need a separate
        //pause event in case it's triggered by something else (eg. native controls, or ended event)
        etc.listen(player.media, 'pause', function(e)
        {
            //if the indicator is showing
            if(player.indicator.icontype === 'loading')
            {
                /*** DEV LOG (hide indicator) ***//*
                if($this.logs.video)
                {
                    videolog([[e.type.toUpperCase(), 18],['',26],['HIDE', 0]],['<dfn>','</dfn>']);
                } */

                //hide indicator while paused
                hideIndicator(player);

                //if we have audio descriptions (whether or not they're enabled)
                if(player.audio)
                {
                    //reset the audio waiting flag
                    player.audiodesk.waiting = false;

                    /*** DEV LOG (audio wait) ***//*
                    if($this.logs.audio)
                    {
                        audiolog([['AUDIO-WAIT', 18],['',26],['GOOD', 0]],['<dfn>','</dfn>']);
                    } */

                    //then if audio descriptions are enabled
                    if(player.audiodesk.enabled)
                    {
                        //unmute the audio unless the media is also muted
                        player.audio.muted = player.media.muted;
                    }
                }
            }
        });

        //if we have audio descriptions
        if(player.audio)
        {
            //we need to make sure that the audio is muted by default
            //so you never hear a snatch of it during initial video buffering
            //and we can use the video loadstart event to apply that state
            etc.listen(player.media, 'loadstart', function(e)
            {
                //if the audio is enabled
                //nb. also check that it still exists just in case it's fired an error
                if(player.audio && player.audiodesk.enabled)
                {
                    //set the audio waiting flag
                    player.audiodesk.waiting = true;

                    //mute the audio while we're waiting
                    player.audio.muted = true;

                    /*** DEV LOG (audio wait) ***//*
                    if($this.logs.audio)
                    {
                        audiolog([['AUDIO-WAIT', 18],['',26],['WAIT', 0]],['<dfn>','</dfn>']);
                    } */
                }
            });

            //however browsers which don't fire enough waiting/canplay may not fire
            //the canplay event that unmutes it for first playback, so we also need
            //a secondary playing event that does the same thing for those browsers
            var firstplaying = etc.listen(player.media, 'playing', function(e)
            {
                //silence this event
                firstplaying.silence();

                //check that we do actually have enough time buffered
                //nb. the isTimeBuffered function won't return true unless the
                //first time range contains at least 2s, to cater for IE11
                //always pre-loading the first 1-2s of video, but that might
                //not be enough to be ready in low bandwidth, so we still need to check
                //(and if not, the audio will be synced and unmuted by the timeupdate loading events)
                if(isTimeBuffered(player.media))
                {
                    //reset the audio waitinf flag
                    player.audiodesk.waiting = false;

                    /*** DEV LOG (audio wait) ***//*
                    if($this.logs.audio)
                    {
                        audiolog([['AUDIO-WAIT', 18],['',26],['GOOD', 0]],['<dfn>','</dfn>']);
                    } */

                    //if the audio is enabled
                    //nb. also check that it still exists just in case it's fired an error in between
                    if(player.audio && player.audiodesk.enabled)
                    {
                        //synchronise the audio with the video
                        audioSynchronise(player);

                        //unmute the audio unless the media is also muted
                        player.audio.muted = player.media.muted;
                    }
                }
            });

            //nb. we can't resync after audio loading because some browsers fire waiting/canplay
            //for every single seek (opera next, firefox), and since sync causes seek, that would
            //trigger another pair, which would trigger another seek, and so on indefinitely
            //we also can't use timeupdate isTimeBuffered monitoring to check the
            //audio loading state, because the seeking that occurs when we
            //re-sync the audio would often briefly trigger that not-loaded state
            //and that would cause another re-sync, which would trigger it again, etc.
            //however in practise it's uncommon for the audio to be loading
            //while the video is playing, since video is ~10x times larger than audio
            //so it's the video loading and relative AD sync that really matters
        }



        //~~ interface ready ~~//

        //now enable the poster and playpause button, except in special cases
        //=> in iOS it still doesn't work until you've actually started to play
        //=> in iOS with stack controls the native icon covers the buttons
        //=> in iOS with row controls pressing the play button causes the
        //   native controls to appear briefly, during the first buffer before playback
        //   so in that case we can't use it until the video actually starts to play
        //   (ie. you can only start it in iOS using the native click to play icon)
        //   but that's not an issue for the audio-only player, indeed we need the custom
        //   play button because there's no native click-to-play icon in that case
        //   nb. I also wanted to do the same thing for Android, for internal consistency,
        //   but if we do that then the click to play icon no longer works at all!
        if(!(defs.agent.ios && !player.isaudio))
        {
            updateControlDisabled(player, 'playpause', false);

            if(player.poster)
            {
                etc.removeClass(player.poster, config.classes['state-disabled']);
            }
        }
        else if(!defs.agent.ios)
        {
            //nb. we don't need to silence this because the browser/mode/plugin
            //combinations that use it only fire a single canplay event at the start
            //but even if they did fire multiple events, it wouldn't matter
            etc.listen(player.media, 'canplay', function()
            {
                updateControlDisabled(player, 'playpause', false);

                if(player.poster)
                {
                    etc.removeClass(player.poster, config.classes['state-disabled']);
                }
            });
        }

        //if this is third-party media, add an extra one-off play event to enable the
        //playpause button and set its state to on, which iOS, Android and IE11 sometimes need
        //* because sometimes their play event doesn't fire, though I don't know why
        //* it doesn't seem to happen predictably or reliably, just now and then
        //* and when I try to isolate it with info output, it's suddenly fine again!
        //* then comment out that code, and it breaks again, so drk what's going on
        //also use this event to remove embedded captions if they're present
        //so that they're not displayed in addition to defined <track> captions
        //nb. unloadModule doesn't work during initialisation, so presumably
        //it requires playback (or maybe just "canplay") before it can be used
        //and since this event is already here we may as well shoehorn into it
        if(library.isThirdPartyMedia(player.mode))
        {
            var jolt = etc.listen(player.media, 'play', function()
            {
                //silence the event
                jolt.silence();

                //update the playpause button state to enabled and on
                updateControlDisabled(player, 'playpause', false);
                updateControlState(player, 'playpause', 'on');

                //if we have embedded youtube captions but they're disabled
                //or we also have local captions and this is not the iphone
                //then unload the captions modules to remove them
                //because the cc_load_policy flag always enables them by default
                //irrespective of the default that was set in the creator studio
                if
                (
                    player.mode == 'youtube'
                    &&
                    (
                        (player.tracks.youtube_captions && !player.tracks.youtube_captions.enabled)
                        ||
                        (player.tracks.captions && !defs.agent.iphone)
                    )
                )
                {
                    player.media.youTubeApi.unloadModule('cc');
                    player.media.youTubeApi.unloadModule('captions');
                }

                //if we have embedded vimeo captions then enable or disable them by similar conditions
                //or if that fails (eg. invalid language code) then show the CC button error state
                //nb. not sure how the vimeo creator specifies defaults so this
                //is the safest way of ensuring we honour what's defined in ozplayer
                //however, the iphone doesn't honour these methods at all, they're ignored
                //captions are always enabled by default even if we turn them off
                //(and the vimeo menu indicates that they're turned off ffs)
                //and if turn them on then we get two sets of captions with playsinline!
                //so don't do any of this for the iphone, users just get what vimeo decides
                if(player.mode == 'vimeo' && !defs.agent.ios)
                {
                    if
                    (
                        (player.tracks.vimeo_captions && !player.tracks.vimeo_captions.enabled)
                        ||
                        (player.tracks.captions)
                    )
                    {
                        player.media.vimeoPlayer.disableTextTrack()
                            .then(function(){})
                            .catch(function(ex)
                            {
                                player.tracks.vimeo_captions.enabled = false;
                                updateControlState(player, 'cc', 'off');
                                updateControlDisabled(player, 'cc', true);
                                etc.render(player.controlform.cc,
                                {
                                    'aria-label' : getLang(player, 'button-cc-error')
                                });
                            });
                    }
                    else
                    {
                        //nb. the vimeo API returns a Promise, which IE11 doesn't fully support
                        //and a failure due to invalid language code may still show captions
                        //maybe it just selects from available languages randomly, dk
                        //but those captions can't be controlled because the CC button is disabled now
                        player.media.vimeoPlayer.enableTextTrack(player.tracks.vimeo_captions_lang)
                            .then(function(){})
                            .catch(function(ex)
                            {
                                player.tracks.vimeo_captions.enabled = false;
                                updateControlState(player, 'cc', 'off');
                                updateControlDisabled(player, 'cc', true);
                                etc.render(player.controlform.cc,
                                {
                                    'aria-label' : getLang(player, 'button-cc-error')
                                });
                            });
                    }
                }
            });
        }



        /*** DEV TMP ***//*
        etc.delay(1000, function()
        {
            etc.each(player.buttonkeys, function(row)
            {
                etc.each(row, function(key)
                {
                    updateControlDisabled(player, key, true);
                });
            });
        }); */



        //now call the phone home function
        //nb. for the free or paid versions, this function does nothing at all
        //but for the subscription version it validates this player instance
        //then aborts and locks playback if it's found to be unlicensed
        xphonehome(player, screentype);



        //*** DEV TMP
        //etc.delay(10000, function() { abortMedia(player, true); });


        //*** DEV TMP (relies on preload=auto)
        //etc.delay(1000, function()
        //{
        //    if(player.poster) { player.poster = etc.remove(player.poster); }
        //    setMediaTime(player, 68);
        //});

        //*** DEV TMP
        //showIndicator(player, 'loading');


        //*** DEV TMP DELAY SO LOAD IS BEFORE FORM ADDITION
        //});

        //finally return true for success
        return true;
    }



    //add the skip and helps links, at the start of the container
    //as well as creating named anchors for the skip links to target
    //nb. this is called before the logo bug because it's more important
    function addSkipLinks(player)
    {
        //if this is ios or android, just exit
        //nb. we don't create the links there because they don't really have
        //any value in a non-keyboard interface, and because they wouldn't
        //be clickable in ios while covered by the click-to-play overlay
        if(defs.agent.ios || defs.agent.android) { return; }


        //create the links list, but don't append it yet
        player.skiplinks = etc.build('ul',
        {
            'class' : config.classes['skip-link-list']
        });

        //compile an array of the keys and target ID hashes we'll need
        //for each of the skip or help link items we're going to create
        var iteminfo = [];


        //create an anchor immediately after the last element in the player's DOM
        //ie. the transcript expander, or transcript, or container, as present
        //with a name and ID compiled from the instance ID plus "-skip-video"
        //and a class that can be used to control its physical presence
        //nb. anchors are more robust than fragment IDs in older browsers
        //nb. however webkit browsers don't move the focus when you follow anchors
        //and firefox doesn't do it either when it's being used with NVDA
        //but we can fix that simply by adding tabindex -1 to the link
        //which also means you can never reach it through the normal tab order
        etc.build('a',
        {
            'name,id'      : player.instance.id + '-skip-video',
            'class'        : config.classes['skip-link-anchor'],
            '=after'       : (player.expander || player.transcript || player.container),
            '.tabIndex'    : -1
        });

        //then add "video" and the ID hash to the iteminfo
        iteminfo.push({ key : 'video', hash : player.instance.id + '-skip-video' });


        //if the video has a transcript
        if(player.options.transcript)
        {
            //if it has an expander then use its summary as the skip target, with an ID
            //compiled from the instance ID plus "-show-hide-transcript", unless it already has an ID
            //so that the skip link goes directly to the element it can interact with
            if(player.expander)
            {
                if(!player.trigger.id)
                {
                    player.trigger.id = player.instance.id + '-show-hide-transcript';
                }

                //then add "transcript" and the ID hash to the iteminfo
                iteminfo.push({ key : 'transcript', hash : player.trigger.id });
            }

            //otherwise we can target the skip link to the transcript container itself
            //(which we know already has an ID otherwise it wouldn't have been valid)
            else
            {
                //so add "transcript" and the ID hash to the iteminfo
                iteminfo.push({ key : 'transcript', hash : player.transcript.id });
            }
        }


        //now iterate through the iteminfo array, and create a linked item for each one
        //each of which has a hash that matches the ID of its target anchor or element
        //as well as a name of just its key so it works with the button tooltips routine
        //with fallback text in an inner span so we can hide it for images-on
        //nb. we also need an outer span for consistency with the buttons, so that
        //we can test its display in the tooltip function to see if CSS is enabled
        //which has to be undisplayed since we can't use off-left positioning on focusable
        //elements, so to counteract the undisplayed text we add aria-label to the outer link
        //nb. also set .tabIndex 0 to avoid browser quirks with link focus behavior
        //(using the DOM property name to avoid any browser differences with the attr name)
        etc.each(iteminfo, function(itemkey)
        {
            etc.build('li',
            {
                '=parent'       : player.skiplinks,
                'class'         : config.classes['skip-link-' + itemkey.key],
                '#dom'          : etc.build('span',
                {
                    '#dom'          : etc.build('a',
                    {
                        'href'          : '#' + itemkey.hash,
                        'name'          : itemkey.key,
                        'aria-label'    : getLang(player, 'skip-link-' + itemkey.key),
                        '.tabIndex'     : '0',
                        '#dom'          : etc.build('span',
                        {
                            '#text'     : getLang(player, 'skip-link-' + itemkey.key)
                        }),
                        //nb. we also need an onclick event for the skip to transcript link
                        //for the benefit of firefox, which doesn't actually set focus on the
                        //target of a hash link, which meant that following the skip link to the
                        //expander trigger still wouldn't allow you to open and close the transcript
                        //but if we pause momentarily and then programatically focus it, then it works
                        'onclick'       : function(e, thetarget)
                        {
                            if(thetarget.name == 'transcript')
                            {
                                etc.delay(function()
                                {
                                    etc.get('#' + thetarget.href.split('#')[1]).focus();
                                });
                            }
                        }
                    })
                })
            });
        });


        //finally append the finished links list at the very start of the container
        //so that it comes before everything else, including the logo-bug link
        //nb. we know that this is a safe reference because the container is never empty
        player.container.insertBefore(player.skiplinks, player.container.firstChild);
    }


    //### PHP ###// <?php if(isset($_GET['fork']) && $_GET['fork'] == 'free'): ?>

    //add the log-bug link inside the container, before the video
    //which is superimposed so it appears at the top-right corner
    function addLogoBug(player)
    {
        //*** DEV TMP (convert string URL to zero-padded character codes)
        //function zeropad(n, length)
        //{
        //    while((n = n.toString()).length < (length || 2))
        //    {
        //        n = '0' + n;
        //    }
        //    return n;
        //}
        //var
        //url = 'http://www.accessibilityoz.com.au/products/ozplayer/'
        //codes = '';
        //etc.each(url.length, function(n)
        //{
        //    codes += zeropad(url.charCodeAt(n), 3);
        //});
        //config['logo-bug-href'] = codes;
        //console.log(config['logo-bug-href']);

        //if the href is still encoded as character codes, convert it back to a string URL
        if(/^([\d]+)$/.test(config['logo-bug-href']))
        {
            var letters = '';
            for(var len = config['logo-bug-href'].length, i = 0; i < len; i += 3)
            {
                letters += String.fromCharCode(parseInt(config['logo-bug-href'].substr(i, 3), 10));
            }
            config['logo-bug-href'] = letters;

            //*** DEV TMP
            //console.log(config['logo-bug-href']);
        }

        //now add the logo-bug before the video, including fallback text in an inner span
        //which is only visible for images-off, and the image itself defined a data URI
        //nb. set aria-hidden=false on the span to try to counteract its lack of display
        //since we can't use off-left positioning on an element that can take the focus
        //and also set aria-label on the link for the same reason
        //nb. also set tabindex=0 to avoid browser quirks with link focus behavior
        //nb. the logo isn't clickable on the iphone, or on the ipad until you've pressed
        //play for the first time, because it's covered by the native click-to-play overlay
        player.logo = etc.build('a',
        {
            '=before'             : player.video,
            'href'                : config['logo-bug-href'],
            'class'               : config.classes['logo-bug'],
            'aria-label'          : getLang(player, 'logo-bug-text'),
            'tabindex'            : '0',
            '#style'              :
            {
                'backgroundImage' : 'url("data:image/png;base64,' + config['logo-bug-data'] + '")'
            },
            '#dom'                : etc.build('small',
            {
                'aria-hidden'     : 'false',
                '#text'           : getLang(player, 'logo-bug-text')
            })
        });

        //then for all browsers, if images are not supported, negate the logo backgroundImage
        //nb. this is just a safety condition so the user can never see both on top of each other
        if(!player.images && player.logo)
        {
            player.logo.style.backgroundImage = 'none';
        }
    }

    //### PHP ###// <?php endif; ?>


    //create a span-wrapped button inside one of the controls fieldsets
    function addControlButton(player, parent, key, enabled, statekey, labelkey, buttonprops)
    {
        //define the core button DOM, including the state class
        //plus the disabled attribute if the button is disabled by default
        //applying the default text and aria-label from lang
        //with a wrapper around the text so we can hide it for the icon view
        var dom =
        {
            'type'          : 'button',
            'name'          : key,
            'class'         : config.classes['field-state-' + statekey],
            'disabled'      : (!enabled ? 'disabled' : null),
            'aria-label'    : getLang(player, 'button-' + key + '-' + labelkey),
            '#dom'          : etc.build('strong',
            {
                '#text'     : getLang(player, 'text-' + key + '-' + labelkey)
            }),

            //add aria-pressed so that screenreaders announce this as a toggle button
            //(which also fixes JAWS+Firefox not announcing changes in aria-label)
            //unless this is the AD button and we have audio links data, in which
            //case it shouldn't have aria-pressed because it's a link not a button
            //or unless it's the rewind or forward buttons which are stateless
            'aria-pressed'  :
            (
                (key === 'ad' && player.audiolinks || key == 'rewind' || key == 'forward')
                ? null
                : statekey == 'on' ? 'true' : 'false'
            ),

            //also define a state flag, which is more efficient
            //to refer to than checking the button's attributes each time
            '.state'        : statekey,

            //if this is the AD button and we have audio links data then set the role to "link"
            //so that screenreaders will describe it as a link to match its function
            //otherwise add the button role to fix an issue with iOS10/VO not conveying
            //the aria-pressed state (https://bugs.webkit.org/show_bug.cgi?id=162269)
            'role'          : (key === 'ad' && player.audiolinks ? 'link' : 'button'),

            //add a mouseup focuser for the benefit of older webkit
            //which otherwise may not focus the buttons when you click them
            'onmouseup'     : function(e, thetarget)
            {
                if(!thetarget.disabled)
                {
                    thetarget.focus();
                }
            }
        };

        //now iterate through the button props and add each one to the dictionary
        //nb. this will define the command function and other bespoke properties
        etc.each(buttonprops, function(value, key)
        {
            dom[key] = value;
        });

        //now create the span-wrapped button inside on of the controls fieldsets
        //including the generic and specific field wrapper classes
        //plus the disabled state class if the button is disabled by default
        //defining a name so we can refer to it in the control form collection
        //but also explicitly creating that reference just to be on the safe side
        //nb. also add a single space after the button, just to create basic spacing
        //for viewing the page without CSS, which won't otherwise be seen
        etc.build('span',
        {
            '=parent'       : parent,
            'class'         : config.classes['field-wrapper']
                            + ' '
                            + config.classes['field-' + key]
                            + ' '
                            + (!enabled ? config.classes['state-disabled'] : ''),
            '#dom'          : (player.controlform[key] = etc.build('button', dom)),
            '#text'         : ' '
        });
    }

    //bind a button's click handler to its command abstraction
    //qualified by a buttonkeyclick flag to prevent key repeats
    function addControlClick(player, key)
    {
        //define the buttonkeyclick flag if we haven't done already
        //with an initial value of null as distinct from false
        if(!etc.def(player.buttonkeyclick))
        {
            player.buttonkeyclick = null;

            //*** DEV TMP
            //if(__.console) { console.log('buttonkeyclick = ' + player.buttonkeyclick); }
        }

        //bind an Enter keydown listener to set the flag to false
        //but only if it's null so that this doesn't itself repeat
        etc.listen(player.controlform[key], 'keydown', function(e)
        {
            //*** DEV TMP (buttonkeyclick)
            //player.konsole.innerHTML = '["' + key + '"] keydown{' + e.keyCode + '} GET keyclick=' + player.buttonkeyclick + '' + '<br>' + player.konsole.innerHTML;

            if(e.keyCode == 13 && player.buttonkeyclick === null)
            {
                player.buttonkeyclick = false;

                //*** DEV TMP (buttonkeyclick)
                //player.konsole.innerHTML = '["' + key + '"] keydown{' + e.keyCode + '} SET > keyclick=' + player.buttonkeyclick + '' + '<br>' + player.konsole.innerHTML;

                //*** DEV TMP
                //if(__.console) { console.log('buttonkeyclick = ' + player.buttonkeyclick); }
            }
        });

        //bind the click handler
        etc.listen(player.controlform[key], 'click', function(e)
        {
            //*** DEV TMP (buttonkeyclick)
            //player.konsole.innerHTML = '["' + key + '"] click GET keyclick=' + player.buttonkeyclick + '' + '<br>' + player.konsole.innerHTML;

            //if the flag is true then return null to block repeats
            if(player.buttonkeyclick === true)
            {
                //*** DEV TMP
                //if(__.console) { console.log('IGNORE (buttonkeyclick == ' + player.buttonkeyclick + ')'); }

                return null;
            }

            //else if the flag is false then set it to true
            //nb. since only keydown events can set it to false
            //this prevents mouse and touch events from being affected
            //* although it doesn't prevent mouse click from working
            //* while Enter is held down, but I don't think that matters
            else if(player.buttonkeyclick === false)
            {
                player.buttonkeyclick = true;

                //*** DEV TMP (buttonkeyclick)
                //player.konsole.innerHTML = '["' + key + '"] keydown{' + e.keyCode + '} SET > keyclick=' + player.buttonkeyclick + '' + '<br>' + player.konsole.innerHTML;

                //*** DEV TMP
                //if(__.console) { console.log('buttonkeyclick = ' + player.buttonkeyclick); }
            }

             //*** DEV TMP (buttonkeyclick)
            //player.konsole.innerHTML = '["' + key + '"] click > FIRE COMMAND' + '<br>' + player.konsole.innerHTML;

            //[else] call and return the command function
            return player.controlform[key].ozcommand();
        });

        //bind an Enter keyup event to reset the flag to null
        //bound to the whole container just in case you Tab away
        //from the button while the Enter key is still held down
        //otherwise, if it was bound to the button, then the flag
        //wouldn't get reset and the next button Enter click would be blocked
        //ie. you'd have to press it twice before the command function fired
        etc.listen(player.container, 'keyup', function(e)
        {
            if(e.keyCode == 13)
            {
                player.buttonkeyclick = null;

                //*** DEV TMP (buttonkeyclick)
                //player.konsole.innerHTML = '["' + key + '"] keyup{' + e.keyCode + '} SET > keyclick=' + player.buttonkeyclick + '' + '<br>' + player.konsole.innerHTML;

                //*** DEV TMP
                //if(__.console) { console.log('buttonkeyclick = ' + player.buttonkeyclick); }
            }
        });

        //if the button has a menu, then also bind an up/down arrow keydown event
        //to the button, which activates the command function to open the menu
        //and also hides any visible tooltip for consistency with enter function
        //nb. we don't need to worry about repeats because this action will always shift focus
        if(player.controlform['menu-' + key])
        {
            etc.listen(player.controlform[key], 'keydown', function(e)
            {
                if(e.keyCode == 38 || e.keyCode == 40)
                {
                    //remove any active tooltip and nullify the tooltipbutton flag
                    maybeRemoveButtonTooltip(player.controlform);

                    //call the command function
                    player.controlform[key].ozcommand();

                    //return false to prevent default
                    //* maybe command should return false
                    //* but how will that impact repeat handling etc?
                    return false;
                }
            });
        }
    }

    //create a menu inside the controls fieldset
    //* this has hard assumptions of being used as a language menu
    //* it will need some refactoring if we want to use it for other menus too
    function addControlMenu(player, key, menudata, menudataprops)
    {
        //*** DEV TMP
        //if(__.console) { console.log('addControlMenu("' + key + '") =>\n\n' + etc.dump(menudata)); }

        //define the core menu DOM, with the menu class and role
        //along with aria-hidden which will be used to toggle its visibility
        //(while its display remains permanent so we can position it while its hidden)
        //including a disabled flag to indicate whether its items are disabled
        //(which can't be .disabled because that will affect IE's rendering)
        //appending it before the associated button (inside its field wrapper)
        var dom =
        {
            '=before'       : player.controlform[key],
            'role'          : 'menu',
            'class'         : config.classes['menu-wrapper'],
            'aria-hidden'   : 'true',
            '.__disabled'     : false
        };

        //iterate through the menudata props and add each one to the dictionary
        //nb. this will define the command function and other bespoke properties
        etc.each(menudataprops, function(value, key)
        {
            dom[key] = value;
        });

        //now create the menu inside the controls fieldset
        //explicitly creating a reference in the controlform collection
        var menu = player.controlform['menu-' + key] = etc.build('span', dom);

        //if CSS is disabled then set aria-hidden to permanently false
        //since the menu content is permanently visible without CSS
        if(!haveCSS(menu))
        {
            menu.setAttribute('aria-hidden', 'false');
        }

        //create a dictionary for the menu items saved as a property of the menu
        menu.menuitems = {};

        //then iterate through the menu data and create each item inside the menu
        //with the menuitemradio role and class and associated aria-checked value
        //which is true if this item matches the currently selected language (or off)
        //and which has tabindex 0 if it's the selected/highlighted item, otherwise tabindex -1
        //nb. we also have internal radio inputs which are only seen and used when viewed without CSS
        //they all have tabindex -1 so that only the parent menu items are in the tab order
        //and have aria-hidden so that screenreaders aren't aware of them at all, since for
        //those users the existing role and aria-checked information is conveyed either way
        //* we can refactor this using data-key and a defkey argument to set the default
        etc.each(menudata, function(track, srclang)
        {
            menu.menuitems[srclang] = etc.build('span',
            {
                '=parent'       : menu,
                'data-srclang'  : srclang,
                'lang'          : track.lang || null,
                'role'          : 'menuitemradio',
                'aria-disabled' : 'false',
                'aria-checked'  : srclang == player.tracks.captions.selected.captions,
                'tabindex'      : srclang == player.tracks.captions.selected.captions ? 0 : -1,
                'class'         : config.classes['menu-item'],
                '#dom'          : etc.build('input',
                {
                    'type'          : 'radio',
                    'name'          : 'menu-radio-' + key,
                    'value'         : srclang,
                    'checked'       : srclang == player.tracks.captions.selected.captions ? 'checked' : null,
                    'tabindex'      : '-1',
                    'aria-hidden'   : 'true'
                }),
                '#text'         : track.label
            });
        });

        //if CSS is enabled and this is the audio-only player
        //apply aria-hidden to the off item (which also undisplays it)
        //nb. the off item in this case has on meaning since you can't
        //turn the transcript off, but we still use the off item as a
        //fallback item for when a selected language fails to load
        //(setting tabindex 0 on it but not selecting it, same as video)
        //so the off item will become temporarily visible in that case
        //then hidden again as soon as another language is successfully loaded
        //nb. but we don't do this without CSS because we can't hide it
        //and it would be contradictory to have it aria-hidden but still visible
        //so in that case it's always visible, but does nothing when you select it
        //(* which is not exactly ideal, but it's an acceptable for now)
        if(haveCSS(menu) && player.isaudio)
        {
            etc.render(menu.menuitems.off, { 'aria-hidden': 'true' });
        }

        //bind a menu key handler, for the Space bar to call the selection handler abstraction
        //and for the Enter key to call the command handler abstraction
        etc.listen(menu, 'keydown', function(e, thetarget)
        {
            if(e.keyCode == 32 && thetarget.getAttribute('aria-checked') !== null)
            {
                menu.selection(menu, thetarget.getAttribute('data-srclang'), e.type);
                return false;
            }
            if(e.keyCode == 13 && thetarget.getAttribute('aria-checked') !== null)
            {
                menu.ozcommand(menu, thetarget.getAttribute('data-srclang'), e.type);
                return false;
            }
        });

        //bind a menu click handler for the fallback radio inputs to call the command handler abstraction
        //and set focus on the parent item for consistency with default keyboard access
        //nb. the menu items are in the tab order but the radio controls are not, however clicking
        //a radio with the mouse will set focus on it, and from then on the arrow keys would
        //move focus between the radio controls as per native behaviour, so we prevent that to
        //maintain a consistent interface by always moving focus from the radio to the parent item
        //nb. these are only seen and used when viewed without CSS, and aren't functionally necessary at all
        //their only purpose is to provide visual structure and obvious selectability to the list of languages
        etc.listen(menu, 'click', function(e, thetarget)
        {
            if(thetarget.type == 'radio')
            {
                thetarget.parentNode.focus();
                menu.ozcommand(menu, thetarget.value, e.type);
            }
        });

        //bind a menu mouseup handler to call the command handler abstraction
        //nb. this will also be used by touch devices via built-in mouse event emulation
        etc.listen(menu, 'mouseup', function(e, thetarget)
        {
            if(etc.button(e) == 1 && thetarget.getAttribute('aria-checked') !== null)
            {
                menu.ozcommand(menu, thetarget.getAttribute('data-srclang'), e.type);
                return false;
            }
        });

        //bind menu key handlers to handle changing the highlight with arrow keys
        //nb. this doesn't select a new language, it merely changes the
        //highlighted item and updates the roving tabindex accordingly
        //nb. mouse highlighting is already implemented with CSS hover states
        etc.listen(menu, 'keydown', function(e, thetarget)
        {
            //which item are we moving to next
            var nextmenuitem = null;

            //when the down/right-arrow is pressed, select the first item
            //if the current target is the last, otherwise select the next one
            //nb. we need right-arrow to handle the horizontal orientation
            //that the menu content will have when viewed without CSS
            if(e.keyCode == 40 || e.keyCode == 39)
            {
                if(thetarget == menu.lastChild)
                {
                    nextmenuitem = menu.firstChild;
                }
                else
                {
                    nextmenuitem = thetarget.nextSibling;
                }
            }

            //[else] when the up/left-arrow is pressed, select the last item
            //if the current target is the first, otherwise select the previous one
            //nb. we need left-arrow to handle the horizontal orientation
            //that the menu content will have when viewed without CSS
            else if(e.keyCode == 38 || e.keyCode == 37)
            {
                if(thetarget == menu.firstChild)
                {
                    nextmenuitem = menu.lastChild;
                }
                else
                {
                    nextmenuitem = thetarget.previousSibling;
                }
            }

            //if we have a next item reference
            //update the roving tabindex then focus the next item
            if(nextmenuitem)
            {
                thetarget.tabIndex = -1;
                nextmenuitem.tabIndex = 0;
                nextmenuitem.focus();
                return false;
            }
        });

        //bind a menu mouseover handler to hide any visible tooltips
        etc.listen(menu, 'mouseover', function(e, thetarget)
        {
            //hide all the slider tooltips
            etc.each(sliders, function(tipslider)
            {
                maybeHideSliderTooltip(tipslider);
            });

            //remove any active tooltip and nullify the tooltipbutton flag
            maybeRemoveButtonTooltip(player.controlform);
        });

        //bind a player container key handler to close the menu if it's open and CSS is enabled
        //and the key is Escape, or it's Tab from the button or Shift-Tab from within the menu,
        //setting focus on the corresponding button only if it's Escape from inside the menu
        //nb. we don't close the menu when tabbing from the menu back to its button
        //because users might not realise that tabbing doesn't move through the items
        //and it might be frustrating for it to close rather than show where focus does move to
        etc.listen(player.container, 'keydown', function(e, thetarget)
        {
            if
            (
                haveCSS(menu)
                &&
                menu.getAttribute('aria-hidden') == 'false'
                &&
                (
                    e.keyCode == 27
                    ||
                    (
                        e.keyCode == 9
                        &&
                        !e.shiftKey
                        &&
                        thetarget == player.controlform[key]
                    )
                    ||
                    (
                        e.keyCode == 9
                        &&
                        e.shiftKey
                        &&
                        etc.contains(menu, thetarget)
                    )
                )
            )
            {
                //*** DEV TMP
                //console.log('*** K CLOSE!!!');

                menu.setAttribute('aria-hidden', 'true');

                if(e.keyCode == 27 && etc.contains(menu, thetarget))
                {
                    player.controlform[key].focus();
                }
            }
        });

        //bind a document click handler to close the menu if it's open and CSS is enabled
        //but only for events that are outside the containing field element
        //so we don't conflict with or duplicate clicks on the triggering button or menuitems
        etc.listen(document, 'click', function(e, thetarget)
        {
            if
            (
                haveCSS(menu)
                &&
                !etc.contains(menu.parentNode, thetarget)
                &&
                menu.getAttribute('aria-hidden') == 'false'
            )
            {
                //*** DEV TMP
                //console.log('*** M CLOSE!!!');

                menu.setAttribute('aria-hidden', 'true');
            }
        });

        //but the ipad doesn't generate document click events, and it wouldn't be appropriate
        //to change the event above to mouseup, because the down target must be the same
        //so it's simplest to to back that up with a generic touchend event for events outside the field container
        //but only if there are no other touches, so that it doesn't fire if you're already touching the menu
        etc.listen(document, 'touchend', function(e, thetarget)
        {
            if
            (
                haveCSS(menu)
                &&
                e.touches.length == 0
                &&
                !etc.contains(menu.parentNode, thetarget)
                &&
                menu.getAttribute('aria-hidden') == 'false'
            )
            {
                //*** DEV TMP
                //console.log('*** T CLOSE!!!');

                menu.setAttribute('aria-hidden', 'true');
            }
        });
    }


    //respond to a responsive event, such as window resize or orientationchange
    //nb. this also gets called during media interface intialisation
    //in case the player's container is already smaller than the player
    function doResponsiveEvent(player, etype)
    {
        //get the current width difference between the responsive container and player container
        //then if it's not zero (for the unlikely but possible case where they're the same)
        //nb. we use the container offset width so it does include the player borders
        //which gives us the actual amount of space that the player is taking up
        if((player.responsivedata.responsivedifference = player.responsive.offsetWidth - player.container.offsetWidth) != 0)
        {
            //define a new responsive width from the current wrapper width
            //plus the negative responsive difference we just calculated
            //constraining the value as applicable to the responsive mode
            //but always constraining the minimum to the absolute min-width
            //unless the mode is "min" [and we've already constrained to the minimum]
            //nb. if the default width is less than the absolute min-width when mode=min
            //then the playerwidth will have already been constrained by the min-width and
            //min-height defined in the core player CSS (which limits its initial rendered width
            //and therefore constrains the value of playerwidth), so we don't need to worry about that
            //nb. use controlform width for audio-only since it has no wrapper width
            var responsivewidth = (player.isaudio ? player.controlform.offsetWidth : player.wrapper.offsetWidth) + player.responsivedata.responsivedifference;
            if(player.options['responsive-mode'] == 'min')
            {
                if(responsivewidth < player.responsivedata.playerwidth)
                {
                    responsivewidth = player.responsivedata.playerwidth;
                }
            }
            else if(responsivewidth < config['smallscreen-minwidth'])
            {
                responsivewidth = config['smallscreen-minwidth'];
            }
            if(player.options['responsive-mode'] == 'max' && responsivewidth > player.responsivedata.playerwidth)
            {
                responsivewidth = player.responsivedata.playerwidth;
            }


            /*** DEV TMP ***//***
            console.info('\n'
                + 'default width     = ' + player.responsivedata.playerwidth + '\n'
                + 'default aspect    = ' + player.responsivedata.playeraspect + '\n'
                + '\n'
                + 'monitored width   = ' + player.responsive.offsetWidth + '\n'
                + 'container width   = ' + player.container.offsetWidth + '\n'
                + 'difference        = ' + player.responsivedata.responsivedifference + '\n'
                + '\n'
                + 'responsive width  = ' + responsivewidth + '\n'
                + 'responsive height = ' + (responsivewidth * player.responsivedata.playeraspect) + '\n'
                + 'smallscreen       = ' + (responsivewidth < config['smallscreen-threshold']) + '\n'
                + 'midscreen         = ' + (responsivewidth >= config['smallscreen-threshold'] && responsivewidth < config['midscreen-threshold']) + '\n'
                + '\n');
            ***/


            //then check the difference is not the same as the last width we applied
            //so that we avoid repeatedly re-applying the same responsive width
            if(responsivewidth != player.responsivedata.responsivewidth)
            {
                //update the stored responsive width with this responsive width
                //then if it's less than the smallscreen threshold
                if((player.responsivedata.responsivewidth = responsivewidth) < config['smallscreen-threshold'])
                {
                    //add the smallscreen class and remove the midscreen class
                    etc.addClass(player.container, config.classes['smallscreen']);
                    etc.removeClass(player.container, config.classes['midscreen']);
                }

                //else [if it equals or exceeds the smallscreen threshold]
                //but it's less than the midscreen threshold
                else if(responsivewidth < config['midscreen-threshold'])
                {
                    //add the midscreen class and remove the smallscreen class
                    etc.addClass(player.container, config.classes['midscreen']);
                    etc.removeClass(player.container, config.classes['smallscreen']);
                }

                //else [if it equals or exceeds the midscreen threshold]
                else
                {
                    //remove the smallscreen and midscreen classes
                    etc.removeClass(player.container, config.classes['smallscreen'] + ' ' + config.classes['midscreen']);
                }

                //don't do this bit for audio-only because it has no visible media element
                if(!player.isaudio)
                {
                    //now update the video size to match the responsive width while retaining the original aspect ratio
                    player.media.setSize(responsivewidth, responsivewidth * player.responsivedata.playeraspect);

                    //for facebook video, the sizing method doesn't work
                    //but it does respond to changes in the container width
                    //so we can resize the video by setting the container width
                    //nb. setting the height doesn't affect it, the video always
                    //sizes itself according to its own aspect ratio, so if we set a
                    //non-matching height we'll just get black space under the controls
                    //*** so how will that work for portrait videos?
                    //*** the height is too large with black space on iOS/Android
                    if(player.mode == 'facebook')
                    {
                        player.container.style.width = responsivewidth + 'px';
                    }
                }

                //close the language menu if it exists and is open and CSS is enabled
                //* this is not generic enough to handle multiple menus
                if
                (
                    player.controlform['menu-cc']
                    &&
                    haveCSS(player.controlform['menu-cc'])
                    &&
                    player.controlform['menu-cc'].getAttribute('aria-hidden') == 'false'
                )
                {
                    player.controlform['menu-cc'].setAttribute('aria-hidden', 'true');
                }

                //update the control form width to match
                player.controlform.style.width = responsivewidth + 'px';

                //update the slider stretch to compensate for the changes
                updateSliderStretch(player);

                //update the poster background-size to match, if it's present
                if(player.poster)
                {
                    player.poster.style.backgroundSize = responsivewidth + 'px ' + (responsivewidth * player.responsivedata.playeraspect) + 'px';
                }
            }
        }
    }


    //maintain the container auto-hiding and auto-hidden classes,
    //monitoring user interaction events to add and remove them
    //so we can hide the controls and adjust the caption position
    //nb. controls and skip links are never hidden while the video is paused
    //so we use play and pause events to manage that behavior
    //however when jumping into fullscreen mode we do auto-hide
    //if the video is already playing, since you'd want that
    //to happen straight away under those circumstances
    function startAutoHiding(player)
    {
        //if auto hiding is disabled, just exit
        //nb. technically you disable this by setting the delay to zero
        //but for safety we're treating any value less than 1 the same
        //because a delay of less than one second would be wholly unusable
        if(config['auto-hiding-delay'] < 1) { return; }

        //[else] if we haven't already defined the autohiding management object
        //define it now, with a set of timer references for managing auto-hide,
        //a set of primer events for adding and removing this behavior
        //when the video plays and pauses, and a set of user interaction events
        //that start and stop the auto-hide timers and show and hide the stack
        //nb. we need both touchstart and touchmove events for this, the former
        //so you can show the controls just by touching the player, and the
        //latter so they stay visible while you're moving one of the sliders
        //and also back it up with a domfocusin event, just in case a player
        //component is focused without an interaction event firing beforehand
        //nb. although that won't work in IE and firefox, and means that
        //auto-hidden controls may not re-appear until the second focus event
        //ie. the tab from outside the container to focus the first button,
        //won't be handled, but it will be when you tab to the second button
        //*** so perhaps we should bind additional focus events
        //*** to the very first skip link and the very last button
        //nb. we don't define this earlier in case autohiding is never needed
        //so we can save memory on defining this object in the first place
        if(!player.autohiding)
        {
            player.autohiding =
            {
                timers :
                {
                    'hiding'        : null,
                    'hidden'        : null
                },
                primers :
                {
                    'play'          : null,
                    'pause'         : null
                },
                autoshow :
                {
                    'mousemove'     : null,
                    'keydown'       : null,
                    'touchstart'    : null,
                    'touchmove'     : null,
                    'DOMFocusIn'    : null
                }
            };
        }

        //now define a media play event, to apply the showing state
        //and define the auto-hiding and auto-showing events
        //nb. we don't want to do this until the video actually plays, so that
        //the controls remain visible all the time until it starts playing
        //nb. by syncing this with events rather than controls interactions
        //we ensure that they work via programmatic and native interactions too
        player.autohiding.primers.play = etc.listen(player.media, 'play', function()
        {
            primeAutoHiding(player);
        });

        //also define a media pause event, to apply the showing state
        //and silence the auto-show events, so that the controls and
        //skip links are always visible when the media is paused
        player.autohiding.primers.pause = etc.listen(player.media, 'pause', function()
        {
            unprimeAutoHiding(player);
        });
    }

    //apply the showing state and define the auto-hiding and auto-showing events,
    //when the media plays, or when entering fullscreen mode during playback
    //nb. this isn't strictly necessary when the controls options is "row"
    //and there are no skip links, but it's too convoluted to prevent
    //without also preventing it for fullscreen mode stack controls
    //nb. the second argument overrides applying the showing state
    //so we can call this from the pin function to re-init without showing
    function primeAutoHiding(player, noshow)
    {
        //if the nowshow argument is false or undefined
        //apply the showing state and start the timer to auto-hide
        if(!noshow)
        {
            autoShowingState(player);
        }

        //then define each of the interaction events that restarts that behavior, if not already defined
        etc.each(player.autohiding.autoshow, function(handler, type)
        {
            if(!handler)
            {
                player.autohiding.autoshow[type] = etc.listen(player.container, type, function(e)
                {
                    autoShowingState(player);
                });
            }
        });
    }

    //apply the showing state and silence the auto-show events, when the media pauses
    function unprimeAutoHiding(player)
    {
        //apply the showing state
        doShowingState(player);

        //then silence the autoshow events and nullify the references
        etc.each(player.autohiding.autoshow, function(handler, type)
        {
            if(handler)
            {
                handler.silence();
                player.autohiding.autoshow[type] = null;
            }
        });
    }

    //apply the showing state when the hiding state was applied, then start a
    //new timer to re-apply the hiding state in the absence of user interaction
    function autoShowingState(player)
    {
        //apply the showing state
        doShowingState(player);

        //then start a new hiding timer to call the hiding function
        //using the auto hiding delay time specified in config
        player.autohiding.timers.hiding = etc.delay(config['auto-hiding-delay'] * 1000, function()
        {
            autoHidingState(player);
        });
    }

    //apply the showing state when the hiding state was applied, by resetting all
    //existing autohiding timers and remove the hiding and hidden classes
    function doShowingState(player)
    {
        //clear any running hiding timers and nullify the references
        etc.each(player.autohiding.timers, function(timer, key)
        {
            if(timer)
            {
                player.autohiding.timers[key] = nullifyTimer(timer);
            }
        });

        //remove the container hidden and auto-hiding classes
        etc.removeClass(player.container, config.classes['auto-hidden'] + ' ' + config.classes['auto-hiding']);

        //then update the slider stretch in case the video has been resized
        //above the smallscreen threshold while the controls were hidden,
        //in which case the slider stretch won't have had correct offset data
        updateSliderStretch(player);
    }

    //apply the hiding state after a period of time without user-interaction
    //by applying first the hiding class that initiates the hide transition
    //then giving that time to finish, then applying the hidden class
    //that adjust the position of the caption after they're fully hidden
    function autoHidingState(player)
    {
        //add the hiding class to the container to trigger its transition
        etc.addClass(player.container, config.classes['auto-hiding']);

        //then pause for as long as the hiding speed specified in config
        //nb. this should match or exceed the speed of the CSS hiding transition
        player.autohiding.timers.hiding = etc.delay(config['auto-hiding-speed'] * 1000, function()
        {
            //then unless this gets interrupted in the meantime
            //add the fully hidden class that will adjust the captions position
            etc.addClass(player.container, config.classes['auto-hidden']);
        });
    }


    //add a poster overlay to the video to shore-up the native poster
    //attribute, and to provide a click-to-play action on the video
    function addPoster(player)
    {
        //create a null poster reference by default, in case we don't create one
        var poster = null;

        //don't do this for third-party media, because people expect to see familiar play icons
        //also don't do this for iOS because we'll be hiding its own click to play icon
        //and although that might be a nice design choice, it messes with user expectation
        //because that icon is very much an entrenched feature of video, on the iphone at least,
        //although we do add our own to the poster anyway, it will obviously look different
        //so ultimately, in both cases, we're preserving iconic brand identifiers that users expect
        //(not to mention that in iOS the play function doesn't seem to work until it's already started)
        //nb. although in Android it's still possible to play and pause by touching the video
        //which is slightly annoying since you need that touch to show autohidden controls
        //but we can't prevent it without also blocking scrolling when any finger is touching it
        //which is obviously not acceptable given the relative size of the video element
        //however we can take some comfort from that the fact that even raw native video
        //in Android has the same issue, but users can get around it by touching with more than
        //one finger, or by holding down their finger for a longpress duration, or by swiping
        //slightly at the same time, in which cases the native touchstart action doesn't happen
        //if you're really concerned about it, you could always use row controls instead of stack
        if(!(defs.agent.ios || library.isThirdPartyMedia(player.videoType)))
        {
            //the poster image doesn't show in the flash player, or even in all native players
            //(eg. in IE9 the poster is replaced by the first video frame once available)
            //so create an image that's superimposed, that we then remove when you start playing
            //or if we don't have a specified image, the poster will just be a black background
            //nb. using 100% width and height rather than specified or offset dimensions
            //in case the video size is not specified, which means some players will render it at a
            //smaller default size, then some will resize to native size once the metadata has loaded
            //nb. the image needs to be able to scale to fit the specified video size
            //and it shouldn't show up without css, because it's decoration not content
            //however to implement both of those features we need background-size, which
            //isn't supported in older browsers; I did consider falling back to using a
            //normal image, to get the scaling behavior over the css-off behavior
            //but ultimately decided that the latter is more important, so we use a
            //span with background size for everyone, but also set a background position
            //so that if the sizing is not supported you'll see the top-center portion
            //we also don't repeat the image in case it has to be scaled for full-screen
            //in which case we might have to tweak its height to match the video's aspect ratio
            //(ie. so that some of the poster's background area is black)

            //so, get the poster size from the media wrapper's offsets
            var
            width = player.wrapper.offsetWidth,
            height = player.wrapper.offsetHeight;

            //then create the poster as specified, appended to the container
            //and including an inner span for the big play icon
            //plus additional inner spans for the css3 icon components
            //nb. this is disabled by default and then becomes enabled when
            //the controls play button is enabled, because this won't function
            //until that happens and sometimes it's delayed by loading events
            //nb. also add aria-hidden so that screenreaders don't announce it
            //eg. NVDA just says "clickable" even if it has an aria-label
            poster = etc.build('span',
            {
                '=parent'                   : player.container,
                'class'                     : config.classes['poster'] + ' ' + config.classes['state-disabled'],
                'aria-hidden'               : 'true',
                '#style'                    :
                {
                    'backgroundImage'       : ((poster = player.video.getAttribute('poster')) ? ('url(' + poster + ')') : 'none'),
                    //nb. the escape is to avoid symbol compression
                    'backgroundPosition'    : '50%\ 0%',
                    'backgroundSize'        : width + 'px ' + height + 'px'
                },
                '#dom'                      : etc.build('span',
                {
                    '#dom'                  : etc.build('span',
                    {
                        '#dom'              : etc.build('span')
                    })
                })
            });

            //bind a poster click handler to play the video
            etc.listen(poster, 'click', function(e)
            {
                //ignore this event if the playpause button is still disabled
                if(player.controlform.playpause.disabled) { return false; }

                //if the poster is still present, remove its inner icon span
                //ie. the icon disappears immediately, but the poster itself
                //won't be removed until the first frame of video is available
                //nb. also check the inner icon span is still there, in case you
                //click it again between this and the poster removal play event
                if(poster && poster.firstChild)
                {
                    etc.remove(poster.firstChild);
                }

                //then call the playpause button's command handler
                return player.controlform.playpause.ozcommand();
            });

            //then bind a media play event to remove the poster again
            //nb. using this because rather than the poster's click event
            //because there are several other ways you can make the video play
            var killposter = etc.listen(player.media, 'play', function()
            {
                //immediately remove this event again so it can't happen twice
                killposter.silence();

                //remove the video's poster attribute if it has one
                //so that during initial buffering (and if you pause during that)
                //the video won't show (or go back to) its poster image, it will either have
                //a black background, or it will show the first video frame once available
                //nb. this doesn't have any effect on the flash media object,
                //but neither does the fix, so we may as well not bother with it at all
                //(maybe you can't hide a flash object for security reasons?)
                player.video.removeAttribute('poster');

                //then remove the poster overlay itself, if we [still] have one
                if(player.poster)
                {
                    player.poster = etc.remove(player.poster);
                }
            });
        }

        //then return the final poster reference (or null)
        return poster;
    }


    //show the loading indicator
    function showIndicator(player, type)
    {
        //if the indicator is already showing, we're done here
        if(player.indicator.icontype !== null) { return; }

        //if the type is undefined default to "loading"
        //then save it to the indicator icontype property
        player.indicator.icontype = (type || 'loading');

        //add the message to the aria-live region inside the icon container
        //nb. the loading indicator itself remains permanently visible
        //and is hidden with offleft positioning, then shown by resetting
        //its position to zero, then the span inside the icon container has
        //aria-live persistent, and is also hidden using off-left positioning
        //so visually, it appears and disappears no different than usual
        //but for screenreaders, whenever the indicator is shown
        //the message will be announced, to provide a status update
        //nb. it will also provide this information when viewed without CSS
        etc.render(player.indicator.firstChild.firstChild,
        {
            '#text' : getLang(player, 'indicator-' + player.indicator.icontype)
        });

        //nb. we don't show the indicator until the second animation frame
        //so that very short loading periods don't need to show it at all
        //this will also prevent it from appearing in the tiny moments
        //between native waiting/canplay event pairs that fire when
        //seeking between time points which have already been loaded
        //and will avoid the perceptual illusion of the spinner not
        //appearing to move at all until a second frame has animated

        //then only if the type is "loading"
        if(player.indicator.icontype == 'loading')
        {
            //start the timer to animate the icon background position
            //maintaining a frame counter, then measuring the span each time
            //(in case you jump in or out of fullscreen while it's showing)
            //and using the width * frame to define the span background position
            //nb. the loading image has 8 sprites, hence the maxframes value
            var frame = 0, maxframes = 8;
            player.indicator.timer = __.setInterval(function()
            {
                //if this is the second frame and the timer hasn't already been cancelled
                if(frame == 1 && player.indicator.timer)
                {
                    //add the visible and type classes, if not already present
                    //nb. the addClass method already includes a check for that
                    etc.addClass(player.indicator, config.classes['state-visible']);
                    etc.addClass(player.indicator, config.classes['indicator-' + player.indicator.icontype]);
                }

                //now update the background position for this frame number
                player.indicator.firstChild.style.backgroundPosition =
                    (0 - (player.indicator.firstChild.offsetWidth * frame)) + 'px 0';

                //increment the frame number, then reset to zero at maxframes
                if(++frame == maxframes)
                {
                    frame = 0;
                }

            }, config['indicator-speed']);
        }

        //else for any other type
        else
        {
            //show the indicator
            etc.addClass(player.indicator, config.classes['state-visible']);

            //add the indicator type class, unless this is iOS with the
            //timeout "type", because it already has a native failure icon
            //nb. android doesn't fire an error event, but it is caught by the timeout
            //however we can't prevent its native loading indicator from showing as well
            //nothing I've tried successfully removed it, not even the video/x-stop trick
            //however the custom error icon will show above it, so users won't notice :-)
            //of course I did consider just leaving the native icon, but it doesn't actually
            //show the error state, it just keeps showing the loading spinner forever
            //* but will it still be trying to establish a network connection?
            //* surely that would timeout, even if the indicator says otherwise?
            //* though it's kinda moot since we can't prevent it anyway!
            if(!(defs.agent.ios && player.indicator.icontype == 'timeout'))
            {
                etc.addClass(player.indicator, config.classes['indicator-' + player.indicator.icontype]);
            }
        }
    }

    //hide the loading indicator
    function hideIndicator(player)
    {
        //if the indicator is not already showing, then we're done here
        //also don't do anything if the timeout indicator is showing
        //because once that's shown it should be shown permanently
        //but the flash player will still try to hide it again
        //* although it would ideally be better to prevent that root event
        if(player.indicator.icontype === null || player.indicator.icontype == 'timeout') { return; }

        //else clear the timer and nullify the reference, if applicable
        if(player.indicator.timer)
        {
            __.clearInterval(player.indicator.timer);
            player.indicator.timer = null;
        }

        //remove the text from the aria-live region
        etc.remove(player.indicator.firstChild.firstChild.firstChild);

        //remove the state and type classes to undisplay the indicator
        etc.removeClass(player.indicator, config.classes['indicator-' + player.indicator.icontype] + ' ' + config.classes['state-visible']);

        //reset the icon background position to zero
        //nb. we may as well do this for all types since the loading type
        //sets it differently, so any other type will have to use !important
        //in its static CSS background-position anyway, to override this
        player.indicator.firstChild.style.backgroundPosition = '0 0';

        //finally reset the icontype to null
        player.indicator.icontype = null;
    }


    //update the state of a control by name (eg. "playpause") and state (eg. "on")
    //nb. if the input state is an array then the first value is the state
    //property and the second is the state class, which is so that a button
    //can have multiple state classes while still only having one state
    //eg. the mute button can be "on high" or "on low" (or "off high" or "off low")
    function updateControlState(player, name, state)
    {
        //if we don't have the specified field, just ignore this
        //(eg. some platforms don't have the volume and mute controls)
        if(!player.controlform[name]) { return; }

        //[else] get the new state and state class according to input
        var klass = null;
        if(state instanceof Array)
        {
            klass = state[1];
            state = state[0];
        }

        //then update the control state and class
        etc.render(player.controlform[name],
        {
            '.state'    : state,
            'class'     : config.classes['field-state-' + state]
                        + (!klass ? '' : (' ' + config.classes['field-state-' + klass]))
        });

        //if the button has aria-pressed, update it to match the state
        if(player.controlform[name].getAttribute('aria-pressed') !== null)
        {
            player.controlform[name].setAttribute('aria-pressed', state == 'on' ? 'true' : 'false');
        }

        //update the aria-label unless the control is disabled, and the element's inner text
        //including re-applying the slider widths if images are disabled and it's necessary
        updateControlText(player, name, player.controlform[name].disabled ? '' : getLang(player, 'button-' + name + '-' + state), getLang(player, 'text-' + name + '-' + state));
    }

    //update the label and inner text of a control by name (eg. "playpause")
    //which also re-applies the slider widths if images are disabled and it's necessary
    //nb. to update just the label or text pass a falsey value for the other
    //nb. the noupdate flag can be used to prevent updateSliderStretch so that
    //we can call this function when the sliders and spacer haven't been built yet
    function updateControlText(player, name, label, text, noupdate)
    {
        //if we don't have the specified field, just ignore this
        //(eg. some platforms don't have the volume and mute controls)
        if(!player.controlform[name]) { return; }

        //if the noupdate flag is false or undefined
        //and images are disabled and a text value is present
        //store the current offset width of the button to compare with
        if(!noupdate && !player.images && text)
        {
            var width = player.controlform[name].offsetWidth;
        }

        //update the aria-label if the value is present
        if(label)
        {
            etc.render(player.controlform[name], { 'aria-label' : label });
        }

        //update the text if the value is present
        if(text)
        {
            player.controlform[name].firstChild.firstChild.nodeValue = text;
        }

        //if the noupdate flag is false or undefined
        //if images are disabled and a text value is present
        //and the new value has caused a change in the button width
        //then re-apply the dynamic widths of the seek and volume siders
        //nb. this qualification avoids unecessary redraws
        if(!noupdate && !player.images && text && width != player.controlform[name].offsetWidth)
        {
            updateSliderStretch(player);
        }
    }

    //update the disabled state of a control by name and disabled state,
    //which can true or false, or undefined to invert the current state
    //nb. as well as setting the disabled property we also update the field class
    //which we originally needed because of IE7's insufficient support for
    //attribute selectors; but even though we don't support IE7 anymore
    //the presence of this class state is now too deep to be worth untangling
    function updateControlDisabled(player, name, disabled)
    {
        //if we don't have the specified field, just ignore this
        //(eg. some platforms don't have the volume and mute controls)
        if(!player.controlform[name]) { return; }

        //[else] get the new disabled state according to arguments
        disabled = etc.def(disabled) ? disabled : !player.controlform[name].disabled;

        //then apply the state to the control and update its field wrapper class
        //nb. we can't use square-bracket notation to refer to these
        //because that won't work once the codebase is compressed
        if(player.controlform[name].disabled = disabled)
        {
            etc.addClass(player.controlform[name].parentNode, config.classes['state-disabled']);
        }
        else
        {
            etc.removeClass(player.controlform[name].parentNode, config.classes['state-disabled']);
        }
    }

    //update the aria-disabled state of all the items in a menu by name and disabled state
    //nb. we only use aria-disabled so that the items are still in the tab order
    function updateControlMenuDisabled(player, name, disabled)
    {
        //if we don't have the specified menu, just ignore this
        if(!player.controlform['menu-' + name]) { return; }

        //[else] apply the state to each item in the menu, if it hasn't been nullified
        //due to load failure, including updating the disabled state of the hidden inputs
        //however don't disable the menuitem if it currently has focus, so that ATs don't
        //announce it becoming disbled because that would be counter intuitive and unhelpful
        //(but do still disable the hidden inputs which are only non-CSS visual indicators)
        etc.each(player.controlform['menu-' + name].menuitems, function(nextmenuitem)
        {
            if(nextmenuitem !== null)
            {
                if(!disabled || nextmenuitem !== document.activeElement)
                {
                    nextmenuitem.setAttribute('aria-disabled', disabled.toString());
                }
                nextmenuitem.firstChild.disabled = disabled;
            }
        });

        //also update the menu's __disabled flag for ease of referencing
        player.controlform['menu-' + name].__disabled = disabled;
    }


    //refresh the seek controls' data with the media duration
    //defining a step resolution appropriate to the length
    //then enable the controls and refresh the custom slider
    function refreshSeekData(player)
    {
        //first calculate the size (in seconds) of each slider step
        //by dividing the duration by the maximum seek resolution,
        //if the results is less than 1 then limit it to 1
        //(which would signify a video shorter than 10 minutes,
        // where the default media seek resolution is 600)
        //otherwise floor the result, and that will produce all but
        //one of the steps required to describe the whole duration
        //(ie. the modulus of that division will be less than step)
        var step = (step = player.media.duration / config['seek-resolution']) < 1 ? 1 : Math.floor(step);


        //now set the temporary slider upating flag, which tells
        //the underlying control to temporarily ignore changes events
        //since we don't want it to fire in response to these modifications
        //otherwise it will dispatch a slider event with incomplete data
        sliders[player.controlform.seek.id].__updating = true;

        //then define the seek slider's "max" attribute as the number of steps
        //multiplied by the step value itself, where the number of steps
        //is (duration / step + 1), with the + 1 to represent the modulus
        //nb. this then the slider event will have to check when
        //the very last index is being selected, and use that to mean
        //"set the time to duration", since we can't set the time
        //beyond the duration, as that doesn't work in the flash player
        player.controlform.seek.setAttribute('max', ((Math.floor(player.media.duration / step) * step)));

        //update the slider's "step" attribute and corresponding timestep property
        player.controlform.seek.setAttribute('step', (player.controlform.seek.timestep = step));

        //define the initial slider "value"
        //which is the current time to the nearest step
        player.controlform.seek.setAttribute('value',  Math.floor(player.media.currentTime / step));

        //then reset the temporary slider upating flag
        sliders[player.controlform.seek.id].__updating = false;


        //now (re-)enable the seek and rewind/forward controls
        updateControlDisabled(player, 'seek', false);
        updateControlDisabled(player, 'rewind', false);
        updateControlDisabled(player, 'forward', false);

        //then refresh the slider with the updated control data
        //and that will re-compile and enable it, ready to use
        addMediaSlider(player.controlform.seek);
    }


    //apply dynamic widths to the sliders and spacer, so that they
    //take up the space remaining after all the buttons have been added
    function updateSliderStretch(player)
    {
        //*** DEV TMP
        //var spaceinfo = { firstChild : '', lastChild : '' };

        //run through the buttonkeys arrays, and add up the width of each
        //field it refers to, then subtract that from the controls form
        //width to get the total amount of space remaining inside this row
        var
        formwidth = player.controlform.offsetWidth,
        controlspace =
        {
            firstChild : 0,
            lastChild  : 0
        };
        etc.each(player.buttonkeys, function(row, rowkey)
        {
            etc.each(row, function(key)
            {
                controlspace[rowkey] += player.controlform[key].parentNode.offsetWidth;

                //*** DEV TMP
                //spaceinfo[rowkey] += '"' + key + '" = ' + player.controlform[key].parentNode.offsetWidth + '\n';
            });
            controlspace[rowkey] = formwidth - controlspace[rowkey];

            //*** DEV TMP
            //spaceinfo[rowkey] += '====================\n'
            //    + 'formwidth = ' + formwidth + '\n'
            //    + 'controlspace.' + rowkey + ' = ' + controlspace[rowkey] + '\n';
        });

        //for the first row, give the seek slider 100% of the available space
        //for the second row, give the volume slider 100% of the space by default
        //but then limit its width to a maximum of twice the form height
        //(or rather, 4 times the width of a standard square button, but we
        // don't refer to that width in case we have to show them as text)
        //with any remanining space after that limit assigned to the spacer
        //this will ensure that the volume slider takes all the available space
        //at the smallest video size, but then the spacer kicks in at larger widths
        //(unless the other buttons are significantly wider than usual!)
        //or if we have no volume control then the spacer takes all the space
        var
        control,
        seekwidth = controlspace.firstChild,
        volumewidth = controlspace.lastChild,
        spacerwidth = 0,
        volumemax = (player.controlform.offsetHeight * 2);
        if(!player.controlform.volume)
        {
            spacerwidth = controlspace.lastChild;
            volumewidth = 0;
        }
        else if(volumewidth > volumemax)
        {
            volumewidth = volumemax;
            spacerwidth = (controlspace.lastChild - volumewidth);
        }

        //if images are disabled then reduce the seekwidth and spacewidth by 1 pixel
        //to avoid cases where the final control gets pushed over to a new line
        //which can happen in IE9 when the button values change, and also in
        //chrome and firefox when jumping in and out of fullscreen mode,
        //and is almost certaintly a manifestation of sub-pixel rounding errors
        //so for safety let's just do that for all browsers without images
        //nb. using seekwidth because the volume slider isn't always present
        //(but there's no configuration where the seek slider isn't present)
        if(!player.images)
        {
            seekwidth --;
            spacerwidth --;

            //and if we're using responsive layout, reduce it by another one again
            //to avoid cases where resize rounding errors could cause the same problem
            if(player.options.responsive)
            {
                seekwidth --;
                spacerwidth --;
            }
        }

        //then if this is firefox, do it either way to avoid additional cases
        //which can happen at some responsive sizes, eg. 320x480 when images are enabled
        //and also at non-responsive 640x360 when colors and fonts are overriden
        if(defs.agent.firefox)
        {
            seekwidth --;
            spacerwidth --;
        }

        //*** DEV TMP
        //spaceinfo.firstChild += '====================\n'
        //    + 'seekwidth = ' + seekwidth + '\n';
        //spaceinfo.lastChild += '====================\n'
        //    + 'volumewidth = ' + volumewidth + '\n'
        //    + 'spacerwidth = ' + spacerwidth + '\n';
        //console.log(spaceinfo.firstChild);
        //console.log(spaceinfo.lastChild);

        //now apply the calculated widths to each of the field wrappers
        //and then if a slider for that field has been created
        //dispatch an event with its current index, so that the rendered
        //position of the slider thumb is updated to match its new width
        (control = player.controlform.seek).parentNode.style.width = seekwidth + 'px';
        if(control.theslider)
        {
            dispatchMediaSliderEvent(control, control.theslider.index);
        }
        if(control = player.controlform.volume)
        {
            control.parentNode.style.width = volumewidth + 'px';
            if(control.theslider)
            {
                dispatchMediaSliderEvent(control, control.theslider.index);
            }
        }
        player.controlform.spacer.style.width = spacerwidth + 'px';
    }


    //set a new media volume and update all the relevant controls and states
    //nb. this abstraction is called directly by the volume slider's index event
    function updateVolume(player, from, to, theslider)
    {
        //return false for failure if the fakevolume flag is already true
        //so it's not possibly to fire thse changes more quickly
        //than the high-latency volumechange event can respond to
        //and also ignore it if we don't have the volume control
        //because in that case you can't change the volume anyway
        //or if the control is disabled, which happens with the
        //youtube plugin until the default volume has been set
        if(player.fakevolume || !player.controlform.volume || player.controlform.volume.disabled)
        {
            return false;
        }

        //define a muted flag for this action, which is the same as media muted,
        //except if muted is true or the value is changing from 0
        //then set muted to false so you can unmute by increasing the volume
        //** or maybe if it was previously muted but volume was not zero
        //** then pressing up-arrow should set it to 0.1 rather than (volume + 0.1)
        var muted = (player.media.muted || from == 0) ? false : player.media.muted;

        //update the video and audio volume, with the to value and the muted flag
        setMediaVolume(player, to, muted);

        //then update the mute button state, passing a state array
        //that defines the updated on/off state, as well as a
        //high/low state corresponding with the current volume
        //nb. we still refer to the media properties rather than internal data
        //so that any failure is accurately reflected in the button state
        updateControlState(player, 'mute',
        [
            (player.media.muted ? 'on' : 'off'),
            (player.media.volume < 0.5 ? 'low' : 'high')
        ]);

        //then pass the basekey and user-volume key to the add storage function
        //along with the current media volume (not the to value, same as for the controls)
        //but round the value to 2 digits to remove any extraneous precision
        //then convert it to a string for consistency, because storage values are all strings
        //which will save the updated value to local storage, unless the basekey is null
        //(which it only will be if config has explicitly disabled user persistence)
        library.addStorageValue(
            player.basekey,
            config['user-volume'],
            (Math.round(player.media.volume * 100) / 100).toString()
            );

        //finally if the theslider argument is true
        if(theslider === true)
        {
            //update the volume slider index, either by
            //setting it to zero if the media is muted, else converting
            //the volume to an integer in the volume slider's index range (0 - 10)
            //nb. this will also update the value in the underlying input
            dispatchMediaSliderEvent(player.controlform.volume, player.media.muted ? 0 : Math.round(player.media.volume * 10));

            //then immediately show the volume slider's tooltip so you can see the new value
            //nb. I did consider setting focus on the tooltip, but that's more process overhead
            //and more to the point, it could be as annoying to some as it is helpful to others
            //ie. without setting focus screenreaders user won't get any benefit from this
            //but if we do set focus then that could annoy all keyboard users
            maybeShowSliderTooltip(player.controlform.volume.theslider, false);
        }

        //return true for success
        return true;
    }


    //load xad meta-data, which happens during initialisation
    function loadXADTrackData(player)
    {
        //set the xad readyState flag to 2 while we make the request
        player.tracks.xad.en.readyState = 2;

        //*** DEV TMP
        //if(__.console) { console.log('loadXADTrackData(readyState='+player.tracks.xad.en.readyState+')'); }

        //load and parse the VTT data specified by the specified track's src
        //nb. pass null for the cue id prefix and "xad" as the cue kind
        //also passing the language code which is always "en" for xad data
        getTrackVTT(
            player.tracks.xad.en,
            null,
            'xad',
            'en',

        //if that completes successfully we'll get a cues array in return
        function(cues)
        {
            //so save that to the cues array in the xad object
            player.tracks.xad.en.cues = cues;

            //*** DEV TMP
            //if(console.table) { console.table(player.tracks.xad.en.cues); }

            //then set the readyState flag to 4, to say we've done this
            player.tracks.xad.en.readyState = 4;
        },

        //or if we failed to load the captions, or the SRC was broken,
        //or the specified VTT file was empty or invalid
        function(status)
        {
            //if the status is 415 then the VTT file was empty
            //so show a console warning with the no usable cues message
            //else show the console warning with the general loading failure message
            etc.console(etc.sprintf(config.lang[status == 415 ? 'vtt-no-usable-cues' : 'vtt-load-failure'],
            {
                status  : status,
                src     : player.tracks.xad.en.src

            }), 'warn');

            //now set the readyState flag to 0, to say we failed here
            player.tracks.xad.en.readyState = 0;

            //if we've added the controls by now
            if(player.controlform)
            {
                //disable the ad button and update it to the "off" state
                //(so it's both grayed and dimmed, and clearly out of it!)
                updateControlDisabled(player, 'ad', true);
                updateControlState(player, 'ad', 'off');

                //set aria-live on the button so that the error message is announced
                //then update the button's aria-label with a short general error message
                etc.render(player.controlform.ad,
                {
                    'aria-live'     : 'assertive',
                    'aria-label'    : getLang(player, 'button-ad-error')
                });
            }

            //*** DEV LOG (delay so our log function has an error reference)
            //etc.delay(200, function(){

            //nullify the player audio reference so we don't keep
            //trying to play and pause it, or keep having to
            //test its readyState to see if we can synchronise
            //we can also use this to detect existing failure
            //when we build the form if it isn't there already
            player.audio = null;

            //*** DEV LOG
            //});
        });
    }


    //load captions and transcript data and update the cc button,
    //which happens during initialisation if the captions are enabled by default
    //or there's a transcript, else it happens when the user enables them
    //for the first time or switches to a new language for the first time
    function loadTracksData(player, isocode)
    {
        //set the corresponding captions readyState flag to 2 while we make the request
        player.tracks.captions[isocode].readyState = 2;

        //*** DEV TMP
        //if(__.console) { console.log('loadTracksData(isocode='+isocode+', readyState='+player.tracks.captions[isocode].readyState+')'); }

        //if we have a transcript container, add the loading message to overwrite any existing content
        //nb. originally I had the markup as part of the lang
        //but decided it would be simpler for translation not to do that
        if(player.transcript)
        {
            etc.appendHTML(player.transcript, '<p><em>' + getLang(player, 'transcript-loading') + '</em></p>', true);
        }

        //then if we've added the controls by now and we have multiple languages
        //disable the language menu items while we're loading
        if(player.controlform && player.tracks.captions.i18n)
        {
            updateControlMenuDisabled(player, 'cc', true);
        }

        //load and parse the VTT data specified by the specified track's src
        //nb. pass null for the cue id prefix so it defines a plain cue
        //and specify "captions" as the cue kind, which affects the resulting markup
        //and also passing the language code for later use in the lang attribute
        getTrackVTT(
            player.tracks.captions[isocode],
            null,
            'captions',
            isocode,

        //if that completes successfully we'll get a cues array in return
        function(cues)
        {
            //so save that to the cues array in the specified captions object
            player.tracks.captions[isocode].cues = cues;

            //then set the readyState flag to 4, to say we've done this
            player.tracks.captions[isocode].readyState = 4;

            //then if we've added the controls by now and we have multiple languages
            //re-enable the language menu items
            if(player.controlform && player.tracks.captions.i18n)
            {
                updateControlMenuDisabled(player, 'cc', false);
            }

            //if captions are enabled
            if(player.tracks.captions.enabled)
            {
                //remove any disabled state class from the captions container
                etc.removeClass(player.captions, config.classes['state-disabled']);

                //update the captions container to match the currentTime
                //using the cues array defined in the captions-selected language track
                //nb. we should do this even when paused, because that's people will expect
                //ie. that when the video is paused you can still view the captions, and that
                //turning them on should show the current time's caption, if there is one
                displayCaption(player, player.media.currentTime);

                //if we've added the controls by now
                //UNLESS the whole video has failed with a loading error
                //which we can identify by checking the indicator type
                //nb. loading the default captions starts before building the controls
                //and usually take longer since it's an asynchronous request
                //but if the browser returns a cached response, it's possible that the
                //request could complete almost instantly, before the controls are built
                if(player.controlform && player.indicator.icontype != 'timeout')
                {
                    //update the button state to replace the loading message
                    //with whatever text is applicable to the current state
                    updateControlState(player, 'cc', (player.tracks.captions.enabled ? 'on' : 'off'));

                    //then if we have multiple languages
                    if(player.tracks.captions.i18n)
                    {
                        //update the button's aria-label and text with the language-specific text
                        //converting the text language code to uppercase so it's visually different from "off"
                        //(and because it's an initialism, although ATs will read the aria-label anyway)
                        //including re-applying the slider widths if images are disabled and it's necessary
                        updateControlText(player, 'cc',
                            etc.sprintf(getLang(player, 'button-cc-lang'), { '1' : player.tracks.captions[player.tracks.captions.selected.captions].label }),
                            etc.sprintf(getLang(player, 'text-cc-lang'), { '1' : player.tracks.captions.selected.captions.toUpperCase() })
                            );
                    }

                    //if the tooltip is currently visible, update it straight away
                    updateVisibleButtonTooltip(player, player.controlform.cc);
                }
            }

            //if we have a transcript container
            if(player.transcript)
            {
                //if we have no additional transcript data, or none which matches the
                //specified language code, or we've already tried and failed to load that data
                //(when using multiple languages) compile the transcript now with just the captions data
                //nb. this means that transcript data will only be used that matches the srclang
                //of a captions track element (or matches the lack of srclang if neither specifies them)
                if
                (
                    player.tracks.transcript === null
                    ||
                    !etc.def(player.tracks.transcript[isocode])
                    ||
                    player.tracks.transcript[isocode].readyState == 0
                )
                {
                    addTranscriptHTML(player, cues);
                }

                //else [if we do have matching transcript data]
                else
                {
                    //set the corresponding transcript readyState flag to 2 while we make the request
                    player.tracks.transcript[isocode].readyState = 2;

                    //load and parse the transcript VTT data at the specified src
                    //nb. pass the config transcript id prefix so it's added to the start of
                    //the cue ids, in order to make them unique from the caption cue ids
                    //which might both just be numbers if neither of them specified other ids
                    //and specifying "transcript" as the cue kind, which affects the resulting markup
                    //and also passing the language code for later use in the lang attribute
                    getTrackVTT(
                        player.tracks.transcript[isocode],
                        config.ids['transcript-id-prefix'],
                        'transcript',
                        isocode,

                    //if that completes successfully we'll get another cues array in return
                    function(transcues)
                    {
                        //so save that to the cues array in the specified transcript object
                        player.tracks.transcript[isocode].cues = transcues;

                        //then set the readyState flag to 4, to say we've done this
                        player.tracks.transcript[isocode].readyState = 4;

                        //now concat the cues and transcues arrays together,
                        //then sort the resulting array numerically by startTime
                        var allcues = cues.concat(transcues);
                        allcues.sort(function(a, b)
                        {
                            return a.startTime - b.startTime;
                        });

                        //and finally compile the transcript with the sorted combined array
                        addTranscriptHTML(player, allcues);
                    },

                    //or if we failed to load the captions, or the SRC was broken,
                    //or the specified VTT file was empty or invalid
                    function(status)
                    {
                        //if the status is 415 then the VTT file was empty
                        //so show a console warning with the no usable cues message
                        //else show the console warning with the general loading failure message
                        etc.console(etc.sprintf(config.lang[status == 415 ? 'vtt-no-usable-cues' : 'vtt-load-failure'],
                        {
                            status  : status,
                            src     : player.tracks.transcript[isocode].src

                        }), 'warn');

                        //now set the readyState flag to 0, to say we failed here
                        player.tracks.transcript[isocode].readyState = 0;

                        //then proceed to compile the transcript with the caption cues we have
                        addTranscriptHTML(player, cues);
                    });
                }
            }

            //*** DEV TMP
            //else if(__.console) { console.log(etc.dump(player.tracks)); }

        },

        //or if we failed to load the captions, or the SRC was broken,
        //or the specified VTT file was empty or invalid
        function(status)
        {
            //if the status is 415 then the VTT file was empty
            //so show a console warning with the no usable cues message
            //else show the console warning with the general loading failure message
            etc.console(etc.sprintf(config.lang[status == 415 ? 'vtt-no-usable-cues' : 'vtt-load-failure'],
            {
                status  : status,
                src     : player.tracks.captions[isocode].src

            }), 'warn');

            //now set the readyState flag to 0, to say we failed here
            player.tracks.captions[isocode].readyState = 0;

            //remove this key from the languages array
            //n.b. this will also give us a way of checking whether all captions are unavailable
            //that we can refer to without needing to check individual readyStates or if captions-selected is off
            player.tracks.captions.languages.splice(etc.find(player.tracks.captions.languages, isocode), 1);

            //if we have a native track, remove the <track> element corresponding
            //with this language so that it's also removed from the textTracks collection
            //to prevent it from still showing up in the native fullscreen language menu
            //nb. although in iOS it won't actually be removed from the native menu instantly
            //not until you exit then enter fullscreen again, however it's removal does
            //effectively nullify the still-present item so that it doesn't cause errors
            //(ie. selecting it does nothing, or causes the "automatic" selection to be loaded)
            if(etc.def(player.tracks.captions[isocode].textTrack))
            {
                etc.remove(player.tracks.captions[isocode].owner);
            }

            //then set the captions enabled flag to false
            player.tracks.captions.enabled = false;

            //add the disabled state class to the captions container
            etc.removeClass(player.captions, config.classes['state-disabled']);

            //then if we've added the controls by now
            //UNLESS the whole video has failed with a loading error
            if(player.controlform && player.indicator.icontype != 'timeout')
            {
                //update the cc button to the "off" state
                updateControlState(player, 'cc', 'off');

                //disable the cc button if there are no available languages at all
                //ie. there was only one language and it failed, or all of multiple languages failed
                updateControlDisabled(player, 'cc', !player.tracks.captions.languages.length);

                //update the button's aria-label to show a short general error message
                //for no available languages, or a language-specific message for single failure
                etc.render(player.controlform.cc,
                {
                    'aria-label' :
                    (
                        !player.tracks.captions.languages.length
                            ? getLang(player, 'button-cc-error')
                            : etc.sprintf(getLang(player, 'button-cc-nolang'), { '1' : player.tracks.captions[isocode].label })
                    )
                });

                //if the tooltip is currently visible, update it straight away
                updateVisibleButtonTooltip(player, player.controlform.cc);

                //if we have multiple languages (and therefore we have a language menu)
                if(player.tracks.captions.i18n)
                {
                    //if CSS is enabled and the menu is open, close it and set focus on the cc button
                    if
                    (
                        haveCSS(player.controlform['menu-cc'])
                        &&
                        player.controlform['menu-cc'].getAttribute('aria-hidden') == 'false'
                    )
                    {
                        player.controlform['menu-cc'].setAttribute('aria-hidden', 'true');
                        player.controlform.cc.focus();
                    }

                    //re-enable the language menu items
                    updateControlMenuDisabled(player, 'cc', false);

                    //remove this item from the cc language menu
                    etc.remove(player.controlform['menu-cc'].menuitems[isocode]);

                    //then nullify its entry in the menuitems dictionary
                    //nb. but don't delete it so we can still reference failed items
                    player.controlform['menu-cc'].menuitems[isocode] = null;

                    //if CSS is disabled, set tabindex 0 on the "off" item and -1 on all others
                    //nb. this would normally be done in the command function next time the menu opens
                    //but that's not applicable here since the non-CSS menu content is permanently visible
                    if(!haveCSS(player.controlform['menu-cc']))
                    {
                        etc.each(player.controlform['menu-cc'].menuitems, function(nextmenuitem, itemkey)
                        {
                            if(nextmenuitem !== null)
                            {
                                nextmenuitem.tabIndex = itemkey == 'off' ? 0 : -1;
                            }
                        });
                    }
                }
            }

            //if we have a transcript, output a general error message to replace the loading message
            //for no available languages, or a language-specific message for single failure
            if(player.transcript)
            {
                etc.appendHTML(player.transcript, '<p><strong><em>' +
                (
                    !player.tracks.captions.languages.length
                        ? getLang(player, 'transcript-error')
                        : etc.sprintf(getLang(player, 'transcript-nolang'), { '1' : player.tracks.captions[isocode].label })
                )
                + '</em></strong></p>', true);
            }

            //*** DEV TMP
            //if(__.console) { console.log(etc.dump(player.tracks)); }
        });
    }

    //compile the transcript output
    function addTranscriptHTML(player, cues)
    {
        //*** DEV TMP
        //if(__.console) { console.log(etc.dump(player.tracks)); }

        //clear the loading message
        player.transcript.innerHTML = '';

        //create a dictionary for storing an element reference to each
        //appended cue, that we'll need later to implement auto-scrolling
        //nb. this can be a property of the transcript itself for convenience
        //since it's already public data, and might be helpful for users
        player.transcript.cues = {};

        //also create a reference to the currently active cue
        //that we'll use to add and remove the active-cue wrapper
        player.transcript.activecue = null;

        //then compile the transcript by appending the HTML for each cue
        //and saving each cue element reference to the transcript's dictionary
        //using the APU for this to avoid an unresponsive script warning
        //because rendering may be even more work than parsing the VTT
        //then once we've output every cue, add the end of transcript message
        //nb. to get the element reference we pass the transcript childNodes
        //collection through etc.list and then retrieve the last member,
        //so we'll get a static reference rather than a dynamic childNodes item
        //nb. pass the selected captions language so we can add a lang attribute
        //nb. specify true for the citation argument, so that the
        //speaker name is added before each cue, if we have it
        new APU(100,

        //when the processor iterates
        function(i)
        {
            //if we've done all the cues then proceed to completion
            if(i == cues.length)
            {
                return this.complete();
            }

            //[else] get the HTML for this caption and append it to the transcript
            //nb. specify true for the citation argument to add speaker information
            etc.appendHTML(player.transcript, getCueHTML(cues[i], true));

            //save the element reference for this cue to the cues array
            player.transcript.cues[cues[i].id] = etc.list(player.transcript.childNodes).pop();

            //call the next iteration
            return this.next();
        },

        //when the processor completes
        function()
        {
            //add the end of transcript message
            etc.appendHTML(player.transcript, '<p>' + getLang(player, 'transcript-end') + '</p>');

        //start it straight away
        }).start();
    }



    //track xad cues by video time select and play xad audio
    //nb. this is triggered by timeupdate events, which can be fired by
    //custom seeking, native seeking, pausing, as well as regular playback
    //so the conditions within this function need to account for all of that
    function xadTracking(player, time)
    {
        //check that the audio exists and that the xad metadata has loaded and parsed
        if(!(player.audio && player.tracks.xad.en.readyState === 4)) { return; }

        //*** DEV TMP
        //console.clear();
        //console.warn('xadTracking(time=' + time + ')\n'
        //         + '\nstarted : ' + player.started
        //         + '\nended   : ' + player.ended
        //         + '\npaused  : ' + player.media.paused
        //         + '\nseeking : ' + player.controlform.seek.seeking
        //         );

        //if we're currently seeking or paused
        //nb. the paused condition also handles seeking via the native controls
        //since they don't update the custom seek slider's seeking flag
        if(player.controlform.seek.seeking || player.media.paused)
        {
            //if an xad cue is currently playing
            if(player.audiodesk.xad.playing)
            {
                //stop any playing xad audio and reset xad tracking
                //setting lastcue to null so it can be selected again
                xadReset(player, null);

                //*** DEV TMP
                //console.error('SEEKING-RESET\n'
                //    + '\nplaying   = ' + player.audiodesk.xad.playing
                //    + '\nactivecue = ' + (player.audiodesk.xad.activecue ? ('["' + player.audiodesk.xad.activecue.id + '"]') : 'NULL')
                //    + '\nlastcue   = ' + (player.audiodesk.xad.lastcue ? ('["' + player.audiodesk.xad.lastcue.id + '"]') : 'NULL')
                //    + '');
           }

            //*** DEV TMP
            //else
            //{
            //    console.error('SEEKING-IGNORED\n'
            //        + '\nplaying   = ' + player.audiodesk.xad.playing
            //        + '\nactivecue = ' + (player.audiodesk.xad.activecue ? ('["' + player.audiodesk.xad.activecue.id + '"]') : 'NULL')
            //        + '\nlastcue   = ' + (player.audiodesk.xad.lastcue ? ('["' + player.audiodesk.xad.lastcue.id + '"]') : 'NULL')
            //        + '');
            //}
        }

        //if we have no activecue and xad audio isn't currently playing
        //(ie. we're not currently or just about to start playing xad audio)
        //proceed to evaluate all xad cues to determine which is the closest
        if(!player.audiodesk.xad.activecue && !player.audiodesk.xad.playing)
        {
            //iterate through the xad cues
            etc.each(player.tracks.xad.en.cues, function(cue, index)
            {
                //if the current time is earlier than this cue time
                //then the cue is in the future and we can ignore it
                //setting playstate to 0 to denote that state
                if(time < cue.startTime)
                {
                    cue.playstate = 0;
                }

                //else if this is the last cue, or [it's an earlier cue and]
                //the current time is before the start of the next cue
                //then this is the closest cue to the current video time
                //however we only proceed to selection if the video has started
                //and isn't currently paused or seeking, so that cues are only
                //ever selected for playback while the video is actually playing
                else if
                (
                    (
                        index == player.tracks.xad.en.cues.length - 1
                        ||
                        time < player.tracks.xad.en.cues[index + 1].startTime
                    )
                    &&
                    (
                        player.started
                        &&
                        !player.media.paused
                        &&
                        !player.controlform.seek.seeking
                    )
                )
                {
                    //if the cue does not match the last cue (so that we're not
                    //selecting a cue that we've only just finished playing)
                    //and we're within sync-resolution of the start of the cue
                    //nb. we have to check within sync resolution, otherwise seeking
                    //to any point in the video and then pressing play would move the
                    //pointer back to the last unplayed audio description, so we have
                    //to ensure that we only select a cue if the pointer is close to it
                    if
                    (
                        cue !== player.audiodesk.xad.lastcue
                        &&
                        time - cue.startTime < config['sync-resolution']
                    )
                    {
                        //set the playstate to 1 to denote that this is ready to be played
                        cue.playstate = 1;

                        //copy this cue to the activecue flag
                        player.audiodesk.xad.activecue = cue;
                    }

                    //else [if the cue does match the last cue or is not within
                    //sync-resolution of the start] then set the playstate to 3
                    //to denote that this is the cue we've just played
                    else
                    {
                        cue.playstate = 3;
                    }
                }

                //otherwise set the playstate to 4
                //to denote that this cue is in the past
                else
                {
                    cue.playstate = 4;
                }
            });

            //*** DEV TMP
            //console.error('SELECTING\n'
            //    + '\nplaying   = ' + player.audiodesk.xad.playing
            //    + '\nactivecue = ' + (player.audiodesk.xad.activecue ? ('["' + player.audiodesk.xad.activecue.id + '"]') : 'NULL')
            //    + '\nlastcue   = ' + (player.audiodesk.xad.lastcue ? ('["' + player.audiodesk.xad.lastcue.id + '"]') : 'NULL')
            //    + '');
        }

        //if we have an active cue (ie. the video is currently playing,
        //and we've selected an xad cue which is ready for playback)
        //and the video playbackrate has not yet been set to zero
        //nb. ignore this if the playback rate is already zero, because changing the
        //playback rate may cause an additional timeupdate event to be triggered
        //which would otherwise cause the start of each cue to be fired twice
        //this also covers us in IE11 which continues to fire timeupdate events
        //at the same interval (and the same currentTime) while the audio cue happens
        //nb. we test the rate against round(rate) just in case any implementation
        //produces a value that's not quite zero when the rate is set to zero
        if(player.audiodesk.xad.activecue && Math.round(player.media.playbackRate) == 1)
        {
            //set the xad playing flag to denote that we're playing a cue
            player.audiodesk.xad.playing = true;

            //set the cue playstate to 2 to denote that it's being playing
            player.audiodesk.xad.activecue.playstate = 2;

            //set the video playback rate to zero so it's effectively paused
            //nb. but we don't actually pause it, so that we don't have to
            //mess around creating fake states in the pause button to allow
            //you to pause the whole thing while the video is already paused
            player.media.playbackRate = 0;

            //set the video time to the cue's start time
            //nb. this allows for discrepancies between the cue's specified
            //start time and the current time at which this happens, which will
            //arise because of the resolution of timeupdate events, ie. there could
            //be up to ~1/3s between the start time and when the event actually fires
            //*** don't do this because it's visually jerky, although that means that
            //*** there will be small discrepancies between the cue time and the video time
            //*** that much discrepancy is allowable as it is for regular AD
            //player.media.setCurrentTime(player.audiodesk.xad.activecue.startTime);

            /*** DEV LOG ***//*
            if($this.logs.video)
            {
                videolog([['PLAYBACKRATE', 18],['',26],['' + player.media.playbackRate, 0]],['<mark>','</mark>']);
            }
            if($this.logs.audio)
            {
                audiolog([['XAD-CUE-START', 18],['',26],[player.audiodesk.xad.activecue.id, 0]],['<dfn>','</dfn>']);
            } */

            //set the audio time to the start audio time specified in the cue
            player.audio.currentTime = player.audiodesk.xad.activecue.startAudio;

            //then play the audio
            player.audio.play();

            //start a timer for the length of the cue to resume normal playback
            //nb. I did try this using audio timeupdate events, but this is much
            //more accurate given the unpredictable resolution of timeupdate events
            player.audiodesk.xad.timer = etc.delay((player.audiodesk.xad.activecue.endAudio - player.audiodesk.xad.activecue.startAudio) * 1000, function()
            {
                //stop any playing xad audio and reset xad tracking
                //setting lastcue to this cue so it can't be immediately selected again
                xadReset(player, player.audiodesk.xad.activecue);
            });

            //*** DEV TMP
            //console.error('PLAYING\n'
            //    + '\nplaying   = ' + player.audiodesk.xad.playing
            //    + '\nactivecue = ' + (player.audiodesk.xad.activecue ? ('["' + player.audiodesk.xad.activecue.id + '"]') : 'NULL')
            //    + '\nlastcue   = ' + (player.audiodesk.xad.lastcue ? ('["' + player.audiodesk.xad.lastcue.id + '"]') : 'NULL')
            //    + '');
        }

        //**** DEV TMP
        //etc.each(player.tracks.xad.en.cues, function(cue, index)
        //{
        //    cue.text = 'xad()';
        //});

        //**** DEV TMP
        //if(console.table) { console.table(player.tracks.xad.en.cues); }
    }

    //stop any playing xad audio and reset xad tracking
    function xadReset(player, lastcue)
    {
        //stop and reset any running xad timer
        player.audiodesk.xad.timer = nullifyTimer(player.audiodesk.xad.timer);

        //stop audio playback
        player.audio.pause();

        //reset the video playback rate
        player.media.playbackRate = 1;

        /*** DEV LOG ***//*
        if($this.logs.video)
        {
            videolog([['PLAYBACKRATE', 18],['',26],[player.media.playbackRate, 0]],['<mark>','</mark>']);
        }
        if($this.logs.audio)
        {
            audiolog([['XAD-CUE-STOP', 18],['',26],[player.audiodesk.xad.activecue.id, 0]],['<dfn>','</dfn>']);
        } */

        //set the lastcue flag according to input
        //nb. whether we reset lastcue depends on whether xad playback
        //was termindate by the end of the cue (in which case we set it to
        //the last cue to prevent it being selected again) or by a seeking reset
        //(in which case we reset it so that the cue can be selected agin)
        player.audiodesk.xad.lastcue = lastcue;

        //reset the active cue flag
        player.audiodesk.xad.activecue = null;

        //reset the xad playing flag
        player.audiodesk.xad.playing = false;
    }



    //update the captions to match a specific time, either
    //adding or replacing the cue that corresponds with the time
    //or removing any existing cue if there isn't one for that time
    function displayCaption(player, time)
    {
        //don't display captions for the audio-only player or for the iphone
        //or for the ipad when the player mode is vimeo
        //nb. since iphone doesn't have custom controls when played inline
        //we can't show the captions since there'd be no way to control them
        //but they will show up natively when played in full-screen mode
        //and can be controlled via the iphone's native player interface
        if(player.isaudio || defs.agent.iphone || (defs.agent.ios && player.mode == 'vimeo')) { return; }

        //*** DEV TMP
        //if(__.console) { console.log('displayCaption(time=' + time + ')'); }

        //look for a cue in the captions cues array specified by captions selected
        //that corresponds with the given time, or null if there isn't one
        var timecue = getTimeCaption(player.tracks.captions[player.tracks.captions.selected.captions].cues, time);

        //if the timecue is null but a caption is currently displayed
        if(timecue === null && player.captions.getAttribute('data-cue') != '')
        {
            //clear the captions container and reset its "data-cue" attribute
            //nb. clearing an element's content by setting innerHTML to empty string
            //is like 10 or 20 times faster than iteratively removing its child nodes
            player.captions.innerHTML = '';
            player.captions.setAttribute('data-cue', '');

            //then add some cheeky padding for when the page is viewed without CSS
            addCaptionPadding(player);
        }

        //or if the timecue is not null and [no caption is currently displayed or]
        //the timecue is different from what's currently displayed
        else if(timecue !== null && player.captions.getAttribute('data-cue') != timecue.id)
        {
            //add the new caption to overwrite any existing content
            //converting the cue text to HTML then appending a DOM conversion
            //and then setting the container's "data-cue" attribute to match the cue id
            //nb. passing innerHTML through a conversion function guarantees
            //that we'll always get a faithful and programatically-accesible result
            //that avoids the browser quirks with adding innerHTML directly
            //nb. specify false for the citation argument so that speaker information
            //isn't added to the caption, because that's only used for the transcript
            etc.appendHTML(player.captions, getCueHTML(timecue, false), true);
            player.captions.setAttribute('data-cue', timecue.id);

            //then add some cheeky padding for when the page is viewed without CSS
            addCaptionPadding(player);
        }
    }

    //add some cheeky padding to the captions for when the page is viewed without CSS
    //nb. this prevents the space taken up by the captions from changing in height
    //which would otherwise cause the controls beneath to keep moving up and down
    function addCaptionPadding(player)
    {
        //so count the number of lines in the captions, and for each
        //fewer than 3, add a paragraph at the end with a non-breaking space
        //which normalizes the height for all but the longest captions
        //so that the controls don't move up and down as the captions change
        //(or at least, not so much; we could do 4 but that would be too much space)
        //these are then hidden with display none so they're not seen in styled captions
        //and also add aria-hidden=true just in case they would create reading pauses
        var lines = etc.get('p', player.captions).length;
        if(lines < 3)
        {
            etc.each(3 - lines, function(n)
            {
                etc.build('p',
                {
                    '=parent'        : player.captions,
                    'class'            : config.classes['captions-spacing'],
                    'aria-hidden'    : 'true',
                    '#text'            : '\u00a0'
                });
            });
        }
    }

    //update the transcript cue markers to match a specific time, either
    //adding or replacing the markers for the cue that corrresponds with the time
    //or removing any existing markers if there isn't a cue for that time
    function displayTranscriptMarkers(player, time)
    {
        //*** DEV TMP
        //if(__.console) { console.log('displayTranscriptMarkers(time=' + time + ', lang=' + player.tracks.captions.selected.transcript + ')'); }

        //if the transcript cues have been defined
        //nb. we have to check in case the captions are already loaded
        //and displaying while additional transcript data is still loading
        if(etc.def(player.transcript.cues))
        {
            //look for a cue in the captions cues array specified by transcript selected
            //that corresponds with the given time, or null if there isn't one
            var timecue = getTimeCaption(player.tracks.captions[player.tracks.captions.selected.transcript].cues, time);

            //if we don't already have a captions cue but we have additional transcript cues
            //then look for a cue in the corresponding additional transcript cues array
            //that corresponds with the given time, or null if there isn't one
            //nb. this means that if a captions cue and transcript cue are both
            //defined with the same start time, the captions cue will take precedence
            //** we could be more precise about this, and override a caption cue
            //** with a transcript cue if the latter starts before the former ends
            if(timecue === null && player.tracks.transcript !== null && etc.def(player.tracks.transcript[player.tracks.captions.selected.transcript]))
            {
                timecue = getTimeCaption(player.tracks.transcript[player.tracks.captions.selected.transcript].cues, time);
            }

            //if the timecue is null but we have an active cue
            if(timecue === null && player.transcript.activecue !== null)
            {
                //remove the transcript markers and nullify the active cue reference
                player.transcript.activecue = deleteTranscriptMarkers(player);
            }

            //or if the timecue is not null and [we have no active cue or]
            //the active cue is different from the timecue
            //nb. double-check that we have a transcript cue for this timecue id
            //just in case of the outside possibility that the transcript is still compiling
            //eg. if you seek far ahead right after page load when the transcript is quite long
            else if
            (
                timecue !== null
                &&
                etc.def(player.transcript.cues[timecue.id])
                &&
                player.transcript.activecue != player.transcript.cues[timecue.id]
            )
            {
                //remove any transcript markers and nullify the active cue reference
                player.transcript.activecue = deleteTranscriptMarkers(player);

                //then update the activecue reference, and add new wrapper(s)
                //nb. double-check that we have a transcript cue for this timecue
                //just in case the transcript hasn't compiled that far, which is
                //pretty unlikely, but possible since it compiles asynchronously
                //nb. the wrapper will be wrapped around the content of each
                //cue paragraph, where a single cue may contain one or more
                //it can therefore can be any element that's allowed inside <p>
                //however <q> and <cite> are already used in caption markup
                //and <b> <i> and <u> might be used in the cue text itself
                //and <span> will be used if the cue text has any <c> tags
                //so we want to avoid all of those to keep the selectors simple
                //therefore I've used <mark> because it's the most semantically relevant
                //then inside that is an <abbr> which is styed to provide the active cue pointer
                //and then after that we append the list of all the cue's content nodes
                if(etc.def(player.transcript.cues[timecue.id]))
                {
                    etc.each((player.transcript.activecue = player.transcript.cues[timecue.id]).childNodes, function(node)
                    {
                        var mark = etc.build('mark',
                        {
                            '=parent'   : node,
                            '#dom'      :
                            [
                                etc.build('abbr',
                                {
                                    'title,aria-label'  : getLang(player, 'transcript-cue-label'),
                                    '#text'             : getLang(player, 'transcript-cue-glyph')
                                }),
                                //nb. make sure there's a space after the glyph
                                //(because language strings can't contain trailing space)
                                //which is added after the element because the element
                                //is an abbr, and we don't want to extend its native border
                                _.createTextNode('\u0020')

                            ].concat(etc.list(node.childNodes))
                        });

                        //*** DEV TMP
                        //console.log(
                        //    'color = ' + etc.getStyle(mark, 'color')
                        //    + '\nbackground = ' + etc.getStyle(mark, 'backgroundColor')
                        //    + '\nequal = ' + (etc.getStyle(mark, 'color') == etc.getStyle(mark, 'backgroundColor')));

                        //however windows high contrast in IE11 renders these mark elements with
                        //the same foreground and background colors, making the text invisible
                        //we could prevent that by not defining any background or color on the element
                        //in the first place, but that's not a particularly attractive solution
                        //and we could have a no-images class for the transcript, but I'm not keen
                        //on complicating that for users or for an udpate to require style changes
                        //and I guess we could scan the entire stylesheets collection to identify
                        //remove rules which apply to <mark> when images are off ... but yeah ... no
                        //so the best solution I can think is if we simply detect that situation
                        //by comparing the computed color and background, and if they're the same
                        //then simply remove the active cue wrapper, so there's no style difference
                        //then at least the cue will scroll and be visible, even with no other style changes
                        //however ... that doesn't work in Chromium Edge, which does apply correctly contrasting
                        //themes colors to the <mark> element (eg. yellow background and black text color),
                        //but then applies an rgba(0,0,0,0) background to the bounds of the inner text content
                        //which renders as a black background, producing black text on a black background (ffs)
                        //so I don't see what else we can do except always remove the active cue wrapper in whc
                        if(player.whc)
                        {
                            deleteTranscriptMarkers(player);
                        }
                    });
                }
            }

            //then if the timecue is not null (whether or not it's changed)
            //nb. we do this every time even if it already matches the current cue
            //so that the scrolling will stay updated if you change the font-size
            //rather than then being wrong until the active cue changes
            if(timecue !== null)
            {
                //if the transcript offset height is less than its scroll height
                //it must have overflow-y scrolling, so auto-scroll the element
                //so that the current cue is in the middle of the scrolling region
                //(roughly, give or take client offset differences eg. border-top)
                //nb. originally I did it so that the cue would be at the top,
                //but I think this is nicer, because then for most of the time
                //you'll still be able to see one or more previous and next lines,
                //which may help provide context and aid overall comprehension
                //nb. if we're so close to the end that the whole of the rest
                //of the transcript is visible, it will only scroll that far
                //or if we're so close to the start that the scrolling
                //offset would be less than zero, then it will stay at the top
                if(player.transcript.offsetHeight < player.transcript.scrollHeight)
                {
                    player.transcript.scrollTop = player.transcript.cues[timecue.id].offsetTop
                        - (player.transcript.offsetHeight / 2)
                        + (player.transcript.cues[timecue.id].offsetHeight / 2);
                }
            }
        }
    }

    //remove the transcript markers if there are any
    //nb. this also removes the active cue pointers
    //although that will leave its trailing space behind,
    //but that doesn't really matter since it won't affect
    //the rendering, and is tricky to prevent anyway because
    //some of the wanted nodes will also be whitespace text nodes
    function deleteTranscriptMarkers(player)
    {
        if(player.transcript.activecue)
        {
            etc.each(player.transcript.activecue.childNodes, function(node)
            {
                while(node.firstChild.childNodes.length > 0)
                {
                    if(node.firstChild.firstChild.nodeName.toLowerCase() != 'abbr')
                    {
                        node.appendChild(node.firstChild.firstChild);
                    }
                    else
                    {
                        etc.remove(node.firstChild.firstChild);
                    }
                }
                etc.remove(node.firstChild);
            });
        }

        //return null so the caller can use it to nullify the active cue reference
        return null;
    }







    //### PHP ###// <?php if(isset($_GET['fork']) && $_GET['fork'] == 'subs'): ?>

    //-- private => phone home function (SUBSCRIPTION VERSION) --//
    function xphonehome(player, screentype)
    {
        //*** DEBUG
        //if(window.console){window.console.log('OZPLAYER SUBSCRIPTION INFO:\n\tInitiate phone-home');}

        //we need JSON to compile the authentication POST data
        //so if it's not supported, just assume an authorized response
        //nb. this doesn't apply to any supported browsers, but we may as well be cautious
        if(!window['\x4a\x53'+'\x4f\x4e'])
        {
            //*** DEBUG
            //if(window.console){window.console.log('OZPLAYER SUBSCRIPTION ERROR:\n\tCannot compile authentication POST data\n\tAUTHENTICATION OK');}

            return;
        }

        //*** DEV TMP (convert a string to zero-padded character codes)
        //function zeropad(n, length)
        //{
        //    while((n = n.toString()).length < (length || 2))
        //    {
        //        n = '0' + n;
        //    }
        //    return n;
        //}
        //var
        //url = '//license.oz-player.com/check',
        //codes = '';
        //for(var len = url.length, i = 0; i < len; i ++)
        //{
        //    codes += zeropad(url.charCodeAt(i), 3);
        //}
        //alert(codes);

        //compile a POST data object with the page and video URLs
        //which can be used by the server process to authenticate this instance
        //nb. this uses the same obfuscation technique as the script host validation
        //which merely makes it harder to find this code using text search
        var xpost =
        {
            '\x70\x61\x67\x65'        : _['\x6c\x6f'+'\x63\x61'+'\x74\x69'+'\x6f\x6e']['\x68\x72'+'\x65\x66'],
            '\x76\x69\x64\x65\x6f'    : player.media['\x73'+'\x72'+'\x63']
        },

        //define the encoded phone home URL
        //nb. this URL decodes as "//license.oz-player.com/check"
        xhome = '047047108105099101110115101046111122045112108097121101114046099111109047099104101099107';

        //*** DEV TMP (//www.brothercake.com/clients/GianWild/VideoPlayer/phonehome.php)
        //xhome = '047047119119119046098114111116104101114099097107101046099111109047099108105101110116115047071105097110087105108100047086105100101111080108097121101114047112104111110101104111109101046112104112';

        //then decode that into a plain text URL
        for(var c = xhome, xhome = '', len = c.length, i = 0; i < len; i += 3)
        {
            xhome += String['\x66\x72'+'\x6f\x6d'+'\x43\x68'+'\x61\x72'+'\x43\x6f'+'\x64\x65'](c.substr(i, 3));
        }

        //*** DEBUG
        //if(window.console){window.console.log('OZPLAYER SUBSCRIPTION INFO:\n\tAuthentication URL='+_.location.protocol+xhome+'\n\tPOST data='+JSON.stringify(xpost));}

        //now initiate a cors request for the phone home URL
        //passing the stringified JSON object as POST data
        //nb. XDomainRequests can only be made on the same protocol as the page
        //so we have to vary the URL protocol according to the location
        //** IE9-10 will abort this request if native playback has already started
        //** perhaps related to loading a media file at the same time?
        //nb. the open-bracket must be on the same line for function name compression
        etc.xrequest(
            _['\x6c\x6f'+'\x63\x61'+'\x74\x69'+'\x6f\x6e']['\x70\x72'+'\x6f\x74'+'\x6f\x63'+'\x6f\x6c'] + xhome,
            JSON.stringify(xpost),
            true,
            function(xresponse, xstatus)
        {
            //if the status is anything except 200 then the request failed
            //although we don't have enough information to know exactly why
            //so we have to assume that all failures are authorized responses
            if(xstatus != 200)
            {
                //*** DEBUG
                //if(window.console){window.console.log('OZPLAYER SUBSCRIPTION ERROR:\n\tAuthentication request returned network error\n\tAUTHENTICATION OK');}

                return;
            }

            //[else] if the status is 200 then the request completed successfully
            //so we need to look at the response data to see if it was authorized

            //if the response data is a numerical string then this might be an authorized response
            if(/(^[\d]{3,}$)/.test(xresponse))
            {
                //it should be an echo of the page URL encoded into ascii codes
                //so let's encode the page URL and compare it with the response
                //nb. this is more robust than decoding the response
                //because that might not have the correct encoding format

                //define a three-digit zeropad function to use with name encoding
                function z(n)
                {
                    while((n = n.toString()).length < 3)
                    {
                        n = '\x30' + n;
                    }
                    return n;
                }

                //then encode the page URL into zero-padded character codes
                for(var c = '', p = xpost['\x70\x61'+'\x67\x65'], l = p.length, i = 0; i < l; i ++)
                {
                    c += z(p['\x63\x68'+'\x61\x72'+'\x43\x6f'+'\x64\x65'+'\x41\x74'](i));
                }

                //*** DEBUG
                //if(window.console){window.console.log('OZPLAYER SUBSCRIPTION INFO:\n\tServer response='+xresponse+'\n\tExpected response='+c);}

                //if they're exactly the same then we have an authorized response
                if(c == xresponse)
                {
                    //*** DEBUG
                    //if(window.console){window.console.log('OZPLAYER SUBSCRIPTION RESPONSE:\n\tServer responded with correct authentication value\n\tAUTHENTICATION OK');}

                    return;
                }

                //*** DEBUG
                //else{if(window.console){window.console.log('OZPLAYER SUBSCRIPTION RESPONSE:\n\tServer responded with incorrect authentication value\n\tAUTHENTICATION DENIED\ -\ PLAYER WILL BE DISABLED');}}
            }

            //[else] if the response is anything else then this is an unauthorized response
            //so we need to abandon playback and lock down the interface

            //*** DEBUG
            //else{if(window.console){window.console.log('OZPLAYER SUBSCRIPTION RESPONSE:\n\tServer responded with explicit failure value\n\tAUTHENTICATION DENIED\ -\ PLAYER WILL BE DISABLED');}}

            //define tabindex on the player container and then set focus on it
            //nb. we have to manage focus since we're going to completely disable
            //and then hide the player controls; we didn't have to do this for other
            //player abort conditions because we kept focus on the fullscreen button
            //** but what about browsers that don't have a fullscreen button?
            player.container.tabIndex = 0;
            player.container.focus();

            //if we have captions, disable them and hide the captions container
            //nb. we must enable them first to ensure that command disables them
            //and we must do this before abort else the button will be disabled
            //(but the command function ignores any calls when the button is disabled)
            if(player.tracks.captions)
            {
                player.tracks.captions.enabled = false;
                etc.addClass(player.captions, config.classes['state-disabled']);
            }

            //if we have a transcript, remove any transcript markers
            if(player.transcript)
            {
                deleteTranscriptMarkers(player);
            }

            //now abort media playback, which will stop the video (and audio),
            //disable all controls apart from fullscreen, and show the X overlay
            //passing the true flag because we do need to explicitly pause the media
            //nb. I was concerned that the video might continue to load in the background
            //since we don't explicitly prevent it; but that doesn't seem to happen
            //although chrome will do so at first, but then stops after a few seconds
            //* why does that happen? why does it not just keep loading the whole thing?
            //* or maybe it does! but then it doesn't keep loading for long enough to do that
            //* it stops after ~10s whereas loading the whole thing takes ~20s
            abortMedia(player, true);

            //the X overlay will show fallback/aria text for load failure
            //so we need to update that text to describe what's actually happened
            //nb. since the change in text occurs almost instantly after the load failure text
            //screenreaders will only announce this new text, not the original load failure
            player.indicator.firstChild.firstChild.firstChild.nodeValue = config.lang['\x69\x6e'+'\x64\x69'+'\x63\x61'+'\x74\x6f'+'\x72-\x75'+'\x6e\x6c'+'\x69\x63e'+'\x6e\x73'+'\x65\x64'];

            //add the "black screen of death" class to the indicator
            //nb. this is used via external css to darken the overlay
            etc.addClass(player.indicator, config.classes['indicator-bsod']);


            //if we have a fullscreen model, and we're in fullscreen mode, then exit fullscreen mode
            //nb. this doesn't work with iphone + youtube because we don't have control over fullscreen
            //so all that auth failure actually does it pause playback and show the message
            //we can't stop the user from just pressing play again within the external player
            //** unless we did somethig more aggressive, eg. respond to every "play" with "pause"
            if(screentype != null)
            {
                if(library.isFullscreen(player.video, player.controlform.fullscreen.screentype))
                {
                    library.leaveFullscreen(player.video, player.controlform.fullscreen.screentype);
                }
            }

            //if we have a fullscreen button, disable it along with all the others
            if(player.controlform.fullscreen)
            {
                updateControlDisabled(player, 'fullscreen', true);
            }

            //now hide the player controls using the hiding state classes
            //nb. the first one only hides tooltips, the second hides the controls
            //but we also need to add the stack controls class for that to work
            //because row controls don't have a hidden state defined in the CSS
            etc.addClass(player.controlform, config.classes['state-hidden']);
            etc.addClass(player.container, config.classes['stack-controls'] + ' ' + config.classes['auto-hidden']);

            //also add aria-hidden so that screenreaders don't read all the disabled controls
            player.controlform.setAttribute('aria-hidden', 'true');

            //if we have a language menu, remove it so that it doesn't expand
            //the focus caret on the failure message (from being displayed but invisible)
            if(player.controlform['menu-cc'])
            {
                etc.remove(player.controlform['menu-cc']);
            }

            //remove native controls to get rid of the native play icon in mobile devices
            //to prevent them from simply pressing play again to trigger external playback
            //nb. this won't necessarily work for iphones, though it used to work in iOS7
            //** IE11+JAWS will sometimes still provide a set of native controls for playback
            //** (perhaps because we've hidden our controls and so it thinks the video is uncontrollable)
            //** which means that users can still play the native video even after failure
            player.video.removeAttribute('controls');
            //nb. and this is reported to work in iOS8 on iphone 5 or later
            //(via css which uses ::-webkit-media-controls to undisplay the controls)
            //** so it's probably only iphone 4 + ios8 for which neither will work
            //** which does of course mean that they can just start playing it again
            etc.addClass(player.video, config.classes['indicator-bsod']);

            //if we have skiplinks, remove them for visual neatness
            //nb. they're not needed anymore anyway, since the keyboard help info
            //is now redundent, and there's nothing left to skip past in the player
            //ie. the next tab stroke from current focus would be the transcript
            if(player.skiplinks)
            {
                player.skiplinks = etc.remove(player.skiplinks);
            }

            //finally add a visible message at the bottom of the video
            //with the same message we used in the indicator fallback/aria text
            //but including aria-hidden so that screenreaders don't read both
            //nb. this will help users to diagnose video failures, so they
            //won't just think it's a bug, or that ozplayer is broken
            etc.build('p',
            {
                '=before'     : player.indicator,
                'aria-hidden' : 'true',
                'class'       : config.classes['indicator-message'],
                '#dom'        : etc.build('span',
                {
                    '#text'   : config.lang['\x69\x6e'+'\x64\x69'+'\x63\x61'+'\x74\x6f'+'\x72-\x75'+'\x6e\x6c'+'\x69\x63e'+'\x6e\x73'+'\x65\x64']
                })
            });
        });
    }

    //### PHP ###// <?php else: ?>

    //-- private => phone home function (FREE / PAID VERSION) --//
    function xphonehome()
    {
    }

    //### PHP ###// <?php endif; ?>







    //-- private => media slider function wrappers --//

    //create a custom slider from a text or range control
    //or refresh an existing slider with updated control data
    //nb. the control must already have min, max and step attributes
    function addMediaSlider(control, tooltipType)
    {
        //if the control doesn't already have a slider object
        //then it hasn't been converted, so pass it directly to the
        if(!etc.def(control.theslider))
        {
            buildSlider(control, (tooltipType || 'value'));
        }

        //else pass it to the buildSlider function with its existing
        //tooltipType, and also passing a refresh flag which tells the
        //function only to update the options data and not rebuild the slider
        else
        {
            buildSlider(control, control.theslider.tooltipType, true);
        }
    }


    //add a new slider callback, which will receive any update
    //to the value of the specified property, from any slider
    //except for changes triggered by the companion dispatch function
    //(else we'd get infinite recursion with the callbacks defined for that event)
    function addMediaSliderEvent(control, prop, callback)
    {
        //[else] create a top-level array in the slider's callbacks dictionary
        //for this property, if necessary, then add the function to that array
        if(!etc.def(control.theslider.callbacks[prop], null))
        {
            control.theslider.callbacks[prop] = [];
        }
        control.theslider.callbacks[prop].push(callback);
    }

    //dispatch a media slider event, which will change the value or index of the
    //specified slider (ie. index if data is a number, or value if it's a string)
    //then dispatch a reciprocal slider event to fire any applicable slider callbacks
    function dispatchMediaSliderEvent(control, data)
    {
        //pass the slider referenced by control and the input data to applySliderValue
        //with a false valueupdate flag so that a reciprocal event is NOT dispatched
        //(else we'd get infinite recursion with the callbacks defined for that event)
        //nb. the apply function will also handle any out-of-range values
        applySliderValue(control.theslider, data, false);
    }







    //-- private => slider construction, control and interaction functions --//

    //build a new slider using properties from a form control
    //which can only be an input of type "text" or "range"
    function buildSlider(control, tooltipType, refresh)
    {
        //set the default refresh flag if undefined, then if it's true
        //get the existing slider object reference from the control
        //nb. it's safe to use this syntax since the default is false
        if(refresh = refresh || false)
        {
            var theslider = control.theslider;
        }

        //else create a new slider object, starting with:
        //=> the ID, from the control ID, which will be dynamically
        //   set and removed from the control according to the slider state
        //=> a slider callbacks dictionary, for storing any callbacks defined
        //   for this slider, indexed by the property it watches (eg. "index")
        //=> the tooltipType as specified by the input argument
        //   which will be "value" for a standard value tooltip,
        //   or "time" to convert the value from (s) to "mm:ss"
        //=> a buffer timer reference for when showing and hiding the tooltip
        else
        {
            var theslider =
            {
                id          : control.id,
                callbacks   : {},
                tooltipType : tooltipType,
                buffer      : null
            };
        }

        //also define a reference to the containing controls form
        //which we need to prevent the tooltips going outside it
        theslider.controlform = control;
        do
        {
            theslider.controlform = theslider.controlform.parentNode;
        }
        while(!etc.hasClass(theslider.controlform, config.classes['controls']));

        //now reset or define the options array, to store the data for each slider option
        //and reset or define the index, to refer to the currently selected options index
        //which defaults to zero unless we find out otherwise (ie. from the control value)
        theslider.options = [];
        theslider.index = 0;

        //get the control's range attributes and convert them to numbers
        //also saving them to the slider as convenience values,
        //eg. so we can get the max value without having to refer to
        //options.length or parse the control's string max attribute
        etc.each((theslider.range = { min : -1, max : -1, step : -1 }), function(value, key)
        {
            theslider.range[key] = parseFloat(control.getAttribute(key));
        });


        //then once have the range numbers we can build the options data
        //the "min" and "max" tell us the first and last values
        //and the "step" tells us how many values are in between
        //nb. it gets a bit confusing actually, because the values in a slider are
        //the value points, not the blocks in between, but we tend to think of positioning
        //and dimensions in terms of a number of unit blocks; a slider with 10 steps
        //has 10 value points, but only 9 unit blocks in between min and max;
        //and the difference is we iterate for (steps + 1) instead of just (steps)
        //nb. we convert the final values to a string to match the value-type of the control
        //and create different tooltip text depending on the slider's tooltipType
        etc.each(((theslider.range.max - theslider.range.min) / theslider.range.step) + 1, function(n, num)
        {
            //calculate the numeric value of this option, then create this option object
            //=> the value is a string version of the numeric value
            //=> the tooltip is a "mm:ss" timestamp if tooltipType is "time"
            //   otherwise it's the same as the value, which we define
            //   even if the tooltipType is "none" because it's used
            //   to set the control tooltip and update the slider aria-valuetext
            theslider.options[n] =
            {
                value     : (num = theslider.range.min + (n * theslider.range.step)).toString(),
                tooltip    : (tooltipType == 'time' ? library.getTimeStamp(num) : num.toString())
            };

            //then if this value matches the control's default value
            //update the slider index to this option index
            if(theslider.options[n].value == control.value)
            {
                theslider.index = n;
            }
        });


        //*** DEV TMP
        //if(__.console) { console.log(etc.dump(slider.options)); }


        //now we can set the slider value property from the default option value
        //then retrospectively set the value back on the underlying control,
        //in case it was erroneously set outside the value
        control.value = theslider.value = theslider.options[theslider.index].value;


        //then if the refresh flag is false, proceed to build a new slider
        if(!refresh)
        {
            //create the slider's outer container and apply its class from config
            //and define its ID using the config template parsed with the control ID
            //nb. this won't be appended until the end, to minimize browser redraws
            theslider.container = etc.build('span',
            {
                'class' : config.classes['slider-container'],
                'id'    : etc.sprintf(config.ids['slider-container'], { id : control.id })
            });

            //then create the track as a child of the container, and apply its class from config
            theslider.track = etc.build('label',
            {
                '=parent'   : theslider.container,
                'class'     : config.classes['slider-track']
            });

            //then create the thumb as a child of the track and give it the "slider" role
            //also define its ID using the prefix defined in config parsed with control ID
            //and add an inner element, that can be used to improve usability by increasing
            //the size of the event target without changing the apparent size of the thumb
            theslider.thumb = etc.build('button',
            {
                '=parent'   : theslider.track,
                'type'      : 'button',
                'role'      : 'slider',
                'class'     : config.classes['slider-thumb'],
                'id'        : etc.sprintf(config.ids['slider-thumb'], { id : control.id }),
                '#dom'      : etc.build('strong')
            });

            //create a "for" association from the track label to the thumb, partly for semantics,
            //but mostly so that when you click the label it sets focus on the thumb
            //nb. since the track is the parent of the thumb, this behavior is what happens anyway
            //in browsers that support implicit association, but we also need to make an
            //explicit association, so we get that robust behavior cross-browser
            theslider.track.htmlFor = theslider.thumb.id;

            //add the tooltip after the thumb, with its class from config and also
            //the default hidden class, also add aria-hidden, which is permanently true
            //since the text exactly duplicates the slider thumb's aria-valuetext,
            //so it's better that screenreaders ignore this to avoid the tautology
            //nb. this was originally called "label" but I changed the
            //config class name to avoid confusion with <label> elements
            //nb. we append this before the thumb, because you may see the thumb
            //as a little sliver of empty button when viewing the page without CSS,
            //and it would be better if that were after the underlying control,
            //so that it comes at the end of this control row
            theslider.tooltip = etc.build('em',
            {
                '=before'        : theslider.thumb,
                'class'          : config.classes['slider-tooltip']
                                 + ' '
                                 + config.classes['state-hidden'],
                'aria-hidden'    : 'true'
            });
        }

        //set the ARIA "valuemin" and "valuemax" attributes on the thumb
        //according to the slider's minimum and maximum option values
        //and set the ARIA "orientation" attribute, which is always
        //horizontal since that's the only orientation we implement
        //nb. since HTML5 the <button> element has 'implicit semantics'
        //which limit it to the roles it's allowed to have, so it's not
        //supposed to be allowed to be a slider, and have aria-valuemin etc.
        //but button is the obvious choice, since it's already a form control
        //and so it supports native keyboard interaction, it can have a value
        //and be disabled, and it can be focused when you click its parent label
        //all the custom sliders I've seen that use ARIA information, implement
        //the slider thumb as a button element, and it was fine in XHTML
        //so the aria semantics must work in screenreaders without conflict
        //although it is slightly unfortunate that the empty button shows up
        //when viewed without CSS, and if it was a span or something that wouldn't happen
        //but the use of button is too deeply entrenched now, and lots of subtle
        //aspects of the slider's behavior would break if it were anything else
        //so basically that's all bullshit, and I'm not going to worry about it
        //not unless I see evidence of a real-world accessibility problem
        etc.render(theslider.thumb,
        {
            'aria-valuemin'     : theslider.options[0].value,
            'aria-valuemax'     : theslider.options[theslider.options.length - 1].value,
            'aria-orientation'  : 'horizontal'
        });

        //if the range max is zero then this slider has been initialized
        //with no data, so that we get the default container and track
        //so disable the thumb and control and set aria-disabled on the thumb
        //also add the general disabled class to the slider container
        //otherwise enable them and remove aria-disabled and the state class
        //nb. I'm not sure aria-disabled is really necessary on elements
        //that have a native disabled property, but I'm using it just to be sure
        //because the thumb has a non-native role ("slider" instead of "button")
        if(theslider.range.max == 0)
        {
            control.disabled = true;
            theslider.thumb.disabled = true;
            theslider.thumb.setAttribute('aria-disabled', 'true');
            etc.addClass(theslider.container, config.classes['state-disabled']);
        }
        else
        {
            control.disabled = false;
            theslider.thumb.disabled = false;
            theslider.thumb.setAttribute('aria-disabled', 'false');
            etc.removeClass(theslider.container, config.classes['state-disabled']);
        }


        //then if the refresh flag is false
        if(!refresh)
        {
            //save a reference to the control as a property of the slider
            //then a circular reference back to the slider as a property of the control
            //(so users have an easy way to get a slider reference from a control reference)
            theslider.control = control;
            control.theslider = theslider;

            //finally append the slider container to the page, directly after the source control
            //nb. we add it after because you may the thumb as a little sliver of empty button
            //when viewing the page without CSS, and it would be better if that were after
            //the underlying control, so that it comes at the end of this control row
            //(which is also why the slider tooltip is before not after the thumb)
            control.parentNode.appendChild(theslider.container);

            //then add the slider to the master sliders dictionary,
            //indexed by its ID (which is the underlying control's ID)
            sliders[theslider.id] = theslider;


            //now bind the slider events and the reciprocal control events
            bindSliderEvents(theslider);
        }


        //finally set the slider to its default value (corresponding with the control value)
        //passing a valueupdate flag corresponding with the refresh flag, which tells it
        //whether ot not update the related properties and dispatch index and values events
        //nb. since the apply function can also handle option indices,
        //and is faster with that value, that's what we'll do internally
        //(even though API-triggered uses of this will generally use the value)
        applySliderValue(theslider, theslider.index, true);


        //return true for success
        return true;
    }


    //add interaction events to a slider, plus corresponding events to its control,
    //so that direct updates to the control are relayed to the slider
    function bindSliderEvents(theslider)
    {
        //define a sliding flag for this slider, which controls whether sliding is active
        //nb. it's a property of the slider so that we can access it from all the events
        //it could have been a top-level property, but this way we allow for the possibility
        //of moving more than one slider simultaneously (eg. via API event, or multi-touch[!!])
        //nb. we're using underscored syntax to denote that it's a private property
        //purely for internal programatic use, and not useful data to the API
        theslider.__sliding = false;


        //~~ mouse-slide events ~~//

        //define a mouse-pressed flag, that we'll use to filter out
        //slide actions when the mouse is not pressed that were
        //inadvertently triggered ny an unusual set of circumstances
        //in the default-answer event (see the event for more notes)
        theslider.__mousepressed = false;

        //apply a thumb "on" (mousedown) event to start the slide action
        etc.listen(theslider.thumb, 'mousedown', function(e, thetarget)
        {
            //only respond to left-button clicks else pass-through the event
            //nb. we don't need to do this on the "move" event as well
            //since it won't respond when the slider flag hasn't been set
            if(etc.button(e) !== 1) { return true; }

            //[else] if the thumb is disabled then block this event
            if(theslider.thumb.disabled) { return false; }

            //set the mouse-pressed flag
            theslider.__mousepressed = true;

            //get the parent thumb (button) target from the event
            //then pass the thumb and the other data to beforeSlide,
            //and return what it returns to block the native action
            return beforeSlide(e, theslider.thumb, theslider);
        });

        //then a corresponding document "off" (mouseup) event to stop the slide action
        //nb. this is set on the whole document, because the mouse
        //can drift outside the button while it's being dragged
        etc.listen(document, 'mouseup', function(e, thetarget)
        {
            //clear the mouse-pressed flag
            theslider.__mousepressed = false;

            //call afterSlide and return the result to control native action
            return afterSlide(e, thetarget, theslider);
        });

        //now bind the document "move" (mousemove) event to do the slide action
        //nb. this is set on the whole document for the same reason as the mouseup
        etc.listen(document, 'mousemove', function(e, thetarget)
        {
            //call doSlide, and return the result to block native action
            //which prevents text-range selection while dragging
            return doSlide(e, thetarget, theslider);
        });



        //~~ touch-slide events ~~//

        //define a touching flag, which we'll use to filter-out multi-touch events
        theslider.__touching = false;

        //bind a thumb "on" (touchstart) event to start the slide action
        etc.listen(theslider.thumb, 'touchstart', function(e, thetarget)
        {
            //if the touching flag is already true then block this event
            //so that it only fires for the first finger, and not for subsequent fingers,
            //and doesn't fire twice if two fingers touch at the same time
            if(theslider.__touching) { return false; }

            //[else] if the thumb is disabled then block this event
            if(theslider.thumb.disabled) { return false; }

            //pass the finger event object and the core event target to beforeSlide
            //nb. we can't just use the e object here because it has no clientX and Y properties
            //we're using changedTouches[0] which refers to the current finger's target
            //but we could just as well use touches[0] in this specific context
            //and given that we filter-out multiple touches at the moment
            beforeSlide(e.changedTouches[0], thetarget, theslider);

            //then return false to block the default action, which stops the zoom-lens
            //and copy-menu being triggered (interestingly enough, that would't happen
            //if we just used the e object, but we can't do that for the reason noted above)
            //this block also stabilizes the drag events, and without it
            //dragging is somewhat skittish and erratic, mis-fires or fails to register the movement
            return false;
        });

        //and a corresponding document "off" (touchend) event to stop the slide action
        etc.listen(document, 'touchend', function(e, thetarget)
        {
            //we only want to proceed here if the finger being released is the same as
            //the finger that was touched to initiate the current drag action
            //and since we ignore secondary touches, that means that we only proceed when the
            //touches array is empty, as it means there are now no fingers touching the screen at all
            if(e.touches.length == 0)
            {
                //pass the event to the afterSlide handler
                afterSlide(e, thetarget, theslider);
            }
        });

        //now bind the document "move" (touchmove) event to do the slide action
        etc.listen(document, 'touchmove', function(e, thetarget)
        {
            //only proceed for events where only one finger is held down
            //nb. even though we filter-out multiple touchstart events, you can still hold
            //your finger down, and after a second or two, a touchmove event is fired on it
            //and the object moves to that finger! so we have to prevent that behavior
            //nb. this filter also means that if you hold down a second finger while the first
            //is dragging a box, neither will respond until you release the second finger again
            //(at which point the first finger will regain control of the thumb)
            if(e.touches.length == 1)
            {
                //pass the first value in the currentTouches collection to the doSlider handler
                //and return the result, so that it blocks the page scrolling action
                //nb. this will always contains the event data for the currently-moving finger
                //which, since we ignore all but the first touch finger, will therefore always be that one
                //and in fact we must use it anyway, because "e" in this context has no clientX and clientY
                return doSlide(e.changedTouches[0], thetarget, theslider);
            }
        });



        //~~ keyboard-slide events ~~//

        //define a pressing flag, that we'll use to filter and control key-repeats
        theslider.__pressing = false;

        //bind a thumb "on" (keydown) event to start and do the slide action
        etc.listen(theslider.thumb, 'keydown', function(e, thetarget)
        {
            //if the pressing flag is true then block this event to prevent native key-repeats
            //nb. we have to do this because not all browsers implement key-repeat
            //so if we want to implement it ourselves, we'll obviously have to
            //cancel the native repeat first, to prevent them conflicting
            if(theslider.__pressing) { return false; }

            //[else] if the thumb is disabled then block this event
            if(theslider.thumb.disabled) { return false; }

            //if this is a valid slide-action key => the left/down or right/up arrow keys
            //(for normal slide actions, where right/up is increase and left/down is decrease)
            //or the home and end keys (for jumping straight to the maximum or minimum value),
            //or the page-up and page-down keys (for forward or backward by 10% of the video length)
            //nb. of course when we do this we are blocking the native page-scrolling action
            //and in some browsers fwd/back navigation (eg. with alt or cmd/ctrl);
            //but we have to! and it's only when the thumb has the focus, as frankly expected,
            //and as native widgets also do anyway (eg. a dropdown selector blocks page navigation
            //while it has the focus, because it uses the arrow keys for internal selection)
            if(verifySliderKey(e))
            {
                //set the pressing flag
                theslider.__pressing = true;

                //call beforeSlide to prep the action, and then
                //call doSlide straight away; but don't return yet
                beforeSlide(e, thetarget, theslider);
                doSlide(e, thetarget, theslider);

                //now we need to pause to implement the key-repeat delay
                //unless the key-repeat rate is zero, which means no delay
                //but not if the event came from the minimize or maximize keys
                //since by definition they can't repeat their action
                if(config['ke\y-repeat-rate'] > 0 && !(e.keyCode == 35 || e.keyCode == 36))
                {
                    //create a new timer at the delay speed defined in config
                    //** why does these have underscored names? is it just a surveyslider hangover?
                    theslider.__keydelay = etc.delay(config['ke\y-repeat-delay'], function()
                    {
                        //call doSlide immediately, so that it happens straight after the delay
                        //(so that the timing is as-defined, rather than one-iteration slower)
                        //passing the custom event-data object we made earlier
                        doSlide(e, thetarget, theslider);

                        //then start a key-repeat interval at the speed defined in config
                        //nb. this will run ad-infinitum until cancelled by the "off" (keyup) event
                        theslider.__keyrepeat = __.setInterval(function()
                        {
                            //call doSlide with the same data again
                            //nb. we don't need to check if it reaches either end
                            //because doSlide will take care of that, via applySliderValue
                            doSlide(e, thetarget, theslider);

                        }, config['ke\y-repeat-rate']);
                    });
                }

                //finally return false to block the native action
                return false;
            }
        });

        //then a corresponding document "off" (keyup) event to reset the slide action
        //and to clear and reset any running key-delay or key-repeat timer
        etc.listen(document, 'keyup', function(e, thetarget)
        {
            //clear the pressing flag
            theslider.__pressing = false;

            //then cancel any delay or repeat timers and nullify the references
            theslider.__keydelay = nullifyTimer(theslider.__keydelay);
            theslider.__keyrepeat = nullifyTimer(theslider.__keyrepeat);

            //call afterSlide and return the result to control native action
            return afterSlide(e, thetarget, theslider);
        });

        //we may also need a thumb "scroll" (arrow keypress), to block page scrolling
        //although only legacy opera ties this action to keypress rather than keydown
        //but it's as well to leave this condition anyway just to be completely safe
        //nb. we can't just use keypress for the slide action in the first place,
        //because you can't capture the arrows keys with keypress
        etc.listen(theslider.thumb, 'keypress', function(e)
        {
            if(verifySliderKey(e)) { return false; }
        });



        //~~ mouse or touch track-snap events ~~//

        //bind a track container "on" (mousedown) listener to implement snap movement
        //that moves the slider thumb to the value-point closest to where you clicked
        //this will also respond to touch because that generates a mousedown as well
        //nb. it's on the container rather than the track to increase the size of the target,
        //and so that you can click beyond the far left/right edge to snap to min/max
        //nb. we can't do this will a click event because the thumb will take the target
        //and anyway we want it to respond immediately on mousedown, not on effective mouseup
        //(although the touch-generated mousedown event actually happens ontouchend)
        etc.listen(theslider.container, 'mousedown', function(e, thetarget)
        {
            //only respond to left-button clicks else pass-through the event
            if(etc.button(e) !== 1) { return true; }

            //[else] if the thumb is disabled then block this event
            if(theslider.thumb.disabled) { return false; }

            //if the target is one of the time-range elements or its container
            //conver it to the parent track, so it works the same as if you'd
            //clicked the track, which is how it will visually seem to users
            if(etc.hasClass(thetarget, config.classes['buffer-time-range']))
            {
                thetarget = theslider.track;
            }

            //only proceed if the target was the container or the track
            //so we don't respond to this event on the thumb or tooltip
            if(thetarget == theslider.container || thetarget == theslider.track)
            {
                //call beforeSlide, to set the sliding flag, focus the thumb and show the tooltip
                //nb. if either the track or container is a LABEL element, then its for association
                //will automatically focus the thumb, which shows the tooltip; but we do it
                //explicitly as well, in case neither of them are, or you clicked the other one!
                beforeSlide(e, thetarget, theslider);

                //get the position of the track with respect to the viewport
                //and save it to the origin property, as though this were a slide action
                //and you were moving the thumb from the very left-edge of the track
                //nb. the value this returns is from the outside-edge of the border
                //(if it has one), but the track's positioning context is inside the border,
                //so we have to add the width of the border to get the position of the inside-edge;
                //and in this context, that width in pixels is represented by its clientLeft value
                //(same as how the border-widths make-up the difference between offsetWidth and clientWidth)
                //nb. the bounding-rect position can be directly compared with the
                //returned mouse co-ordinate, because both are relative to the viewport
                theslider.__origin = theslider.track.getBoundingClientRect().left + theslider.track.clientLeft;

                //now we can call doSlide to implement the thumb movement
                doSlide(e, thetarget, theslider);

                //and then call afterSlide to reset the sliding flag and tooltip
                afterSlide(e, thetarget, theslider);

                //return false to block any native action
                //nb. this may affect the "for" association behavior, but since we've
                //already called beforeSlide to focus the thumb, that doesn't matter
                return false;
            }
        });



        //~~ tooltip events ~~//

        //apply a thumb mouseover event to conditionally
        //show the tooltip, but only if the thumb is not disabled
        //passing the buffer flag so that it's delayed before appearing
        //nb. this caters for mouse but also touch events (for the most part)
        etc.listen(theslider.thumb, 'mouseover', function()
        {
            maybeShowSliderTooltip(theslider, true);
        });

        //double that up with a thumb focus event to do the same thing from the keyboard
        //then start another timer to make it disappear after twice the hide buffer
        //so that it doesn't just stay there forever if you don't move the slider
        //nb. since we fire this with the buffer, we can implement twice the buffer
        //simply by wrapping this call in an identical buffer timeout
        etc.listen(theslider.thumb, 'focus', function()
        {
            maybeShowSliderTooltip(theslider, true, function()
            {
                theslider.buffer = etc.delay(config['tooltip-hide-delay'], function()
                {
                    maybeHideSliderTooltip(theslider, true);
                });
            });
        });

        //then apply a thumb mouseout event to conditionally hide it, likewise
        //unless the sliding flag is true, so it stays there if you're moving the slider
        etc.listen(theslider.thumb, 'mouseout', function()
        {
            if(!theslider.__sliding)
            {
                maybeHideSliderTooltip(theslider, true);
            }
        });

        //and double that up with a thumb blur event,
        //to do the same thing from the keyboard, likewise
        //which also doesn't need to be qualified by any additional flags
        etc.listen(theslider.thumb, 'blur', function()
        {
            maybeHideSliderTooltip(theslider, true);
        });

        //finally add a generic document click event,
        //to instantly remove the tooltip, likewise
        //but only if the event came from outside the slider completely
        etc.listen(document, 'click', function(e, thetarget)
        {
            if(!etc.contains(theslider.container, thetarget))
            {
                maybeHideSliderTooltip(theslider);
            }
        });

        //but the ipad doesn't generate document click events, and it wouldn't be appropriate
        //to change the event above to mouseup, because the down target must be the same
        //so it's simplest to back that up with a generic touchend event
        //that must be outside the slider, and there must be no other touches, so that it
        //doesn't fire if you're using the slider and touch outside with a different finger
        etc.listen(document, 'touchend', function(e, thetarget)
        {
            if(e.touches.length == 0 && !etc.contains(theslider.container, thetarget))
            {
                maybeHideSliderTooltip(theslider);
            }
        });



        //~~ reciprocal control events ~~//

        //define an updating flag, which is set to true just before the slider's value
        //is changed in applySliderValue, and then cleared immediately afterwards
        //this is so we can filter-out value changes on the underlying control that were
        //caused by events on the slider (manual or programatic), and ultimtely avoid
        //an infinite recursion of updating the slider in response to changes from the slider!
        theslider.__updating = true;

        //bind a change event to monitor the control for direct changes
        //nb. this is so that the seek slider still works when viewed without CSS
        etc.listen(theslider.control, 'change', function(e, thetarget)
        {
            //don't do anything if either the sliding or updating flag are set
            //so we don't respond to changes caused by the slider itself
            if(!(theslider.__sliding || theslider.__updating))
            {
                //if the value has changed
                if(theslider.control.value != theslider.value)
                {
                    //pass the updated value to applySliderValue with a true valueupdate flag
                    //nb. we don't need to check that the value is in-range for this slider,
                    //or value input at all, because the apply function takes care of all that
                    applySliderValue(theslider, theslider.control.value, true);
                }
            }
        });
    }

    //before-slide action handler (routed from mouse, keyboard and touch "on" events)
    function beforeSlide(e, thetarget, theslider)
    {
        //set the sliding flag
        theslider.__sliding = true;

        //if this is not a keyboard-triggered "on" (keydown) event
        //(ie. it's a mouse or touch-triggered slide or track-snap event)
        if(e.type != 'keydown')
        {
            //get the track data for this slider, not including the points array
            //nb. we don't need the points data yet, so we can save that process
            //and by the time we do need it we'll need to re-get fresh track data anyway
            var trackdata = getTrackData(theslider, false);

            //now save the starting mouse position, and the thumb origin
            //(the thumb offset relative to the track, allowing for its centering adjustment)
            //nb. we won't need the y-positions because the sliders are all horizontal
            theslider.__origin = e.clientX;
            theslider.__thumborigin = trackdata.thumb.x + trackdata.thumb.unit;
        }

        //if this is a mouse-triggered "on" (mousedown event)
        //set focus on the thumb, which ensures consistency for mouse events
        //with clicking the track directly (which also sets focus because of its "for" association)
        //it also means that it's now possible to move the slider with the mouse
        //allowing for combined-event interactions using both the mouse and the keyboard
        //but there's no point doing this for the keyboard, since it already has the focus,
        //and we shouldn't do it for touch because we don't want it to be focused,
        //otherwise the tooltip will never disappear until something else takes the focus
        //and focus states are not readily apparent on the iPad
        //nb. wrap this in exception handling in case the thumb is hidden
        if(e.type == 'mousedown')
        {
            try { theslider.thumb.focus(); } catch(ex){}
        }

        //show the tooltip, passing a false buffer flag so it appears instantly
        //this call ensures that, whatever other buffered events trigger the tooltip
        //it will always appear when an actual slide action starts
        maybeShowSliderTooltip(theslider, false, function()
        {
            //and when it completes (which it won't if there is no tooltip)
            //start another timer to make it disappear after twice the hide buffer
            //so that it doesn't just stay there forever if you don't move the slider
            //nb. since we fire this with the buffer, we can implement twice the buffer
            //simply by wrapping this call in an identical buffer timeout
            theslider.buffer = etc.delay(config['tooltip-hide-delay'], function()
            {
                maybeHideSliderTooltip(theslider, true);
            });
        });

        //return false to block any native action
        return false;
    }

    //do-slide action handler (routed from mouse, keyboard and touch "move" events)
    function doSlide(e, thetarget, theslider)
    {
        //only proceed if the sliding flag is enabled,
        //otherwise just return true to allow the native action
        if(!theslider.__sliding) { return true; }

        //if this is not a keyboard-triggered "on" (keydown) event
        //(ie. it's a mouse or touch-triggered slide or track-snap event)
        if(e.type != 'keydown')
        {
            //re-get the track data, this time including the points data
            //and save the difference between the current and origin mouse co-ordinates
            //nb. we get the track data afresh here rather than saving it in beforeSlide
            //so that we get the most up-to-date info for each slide event
            //since rendered changes to the layout might have happened in the meantime
            var
            trackdata = getTrackData(theslider),
            movement = (e.clientX - theslider.__origin);

            //then we need to calculate the relative movement along the track
            //so we know how far to move the thumb in response to this event ...

            //if this is a track "on" event, we treat the action as though you were
            //sliding the thumb all the way from its far-left (zero) position every time
            //but we also have to limit it to min (for a value less than zero)
            //or to max (for a value greater than the track width), since the event
            //is on the container not the track, and therefore you can click beyond
            //the left or right edge, to snap the thumb to its min or max value position
            if
            (
                e.type == 'mousedown'
                &&
                (
                    thetarget == theslider.container
                    ||
                    thetarget == theslider.track
                )
            )
            {
                if(movement < 0)                    { movement = 0; }
                else if(movement > trackdata.width)    { movement = trackdata.width; }
                else                                { movement = movement; }
            }

            //otherwise for a regular slide action, the relative movement is the actual movement
            //plus the thumb origin (so we get movement from its start position, not from zero)
            else
            {
                movement += theslider.__thumborigin;
            }

            //but of course we can't just apply the literal movement, we have to quantize it
            //to the slider's nearest value point, so run through the track points array
            //and look for the point position that's nearest to the free position
            //and that will be the value-point position the slider should be moved to :-)
            //but we don't want that! we just want the option index for it
            //which we then pass directly to applySliderValue, to actually move the thumb
            //and update the other relevant slider and control properties
            etc.each(trackdata.points, function(position, index)
            {
                if
                (
                    (movement >= (position - (trackdata.unit / 2)))
                    &&
                    (movement <= (position + (trackdata.unit / 2)))
                )
                {
                    //however, we should only do that if the index is different from its index
                    //otherwise, as soon as it's moved to a new position, it will send a whole stream
                    //of unecessary apply calls just to move it again to the position it's already at
                    if
                    (
                        index != theslider.index
                    )
                    {
                        //pass the updated value to applySliderValue with a true valueupdate flag
                        //and also pass-on the trackdata since we already have it
                        //nb. other things being equal, the apply function would make a fresh call
                        //to get this data, but since we already have it we can save the process
                        //(and nothing will have changed in the last millisecond!)
                        applySliderValue(theslider, index, true, trackdata);

                        //also re-show the tooltip with no buffer and a conditional re-hiding
                        //so that it stays permanently visible for as long as the slider is moving
                        maybeShowSliderTooltip(theslider, false, function()
                        {
                            theslider.buffer = etc.delay(config['tooltip-hide-delay'], function()
                            {
                                maybeHideSliderTooltip(theslider, true);
                            });
                        });
                    }

                    //whether we move or not, return false to break this iteration
                    //as we've found the relevant index, and there can't be more than one
                    return false;
                }
            });
        }

        //otherwise if it is a keyboard-triggered "on" (keydown) event
        else
        {
            //save the index, so we can compare it against its current value
            //before committing ourselves to moving the slider and updating it for real
            var
            index = theslider.index,
            len = theslider.options.length;

            //then if this is a arrow keydown event,
            //we can find the next position to move the slider to
            //by incrementing or decrementing (and limiting) the index
            if(e.type == 'keydown')
            {
                //switch by evaluation
                switch(true)
                {
                    //for the right arrow or up arrow
                    //increment the index by 1 and limit it to maximum
                    case (e.keyCode == 38 || e.keyCode == 39) :

                        if(++index >= len)
                        {
                            index = len - 1;
                        }
                        break;

                    //for the page-up key
                    case (e.keyCode == 33) :

                        //if this is the seek slider, increment the index by 10% of the total duration
                        //then round that figure to the nearest index and limit to maximum
                        if(theslider.control.name == 'seek')
                        {
                            if((index = index + Math.round(len / 10)) >= len)
                            {
                                index = len - 1;
                            }
                        }

                        //else increment the index to the nearest half-way value
                        //which will be the mid-point or the end-point depending on the current value
                        else
                        {
                            var midindex = Math.floor(theslider.options.length / 2);
                            if(index < midindex)
                            {
                                index = midindex;
                            }
                            else
                            {
                                index = (len - 1);
                            }
                        }
                        break;

                    //for the end set the index to max
                    case (e.keyCode == 35) :

                        index = (len - 1);
                        break;

                    //for the left arrow or down arrow
                    //decrement the index by 1 and limit it to minimum
                    case (e.keyCode == 37 || e.keyCode == 40) :

                        if(--index < 0)
                        {
                            index = 0;
                        }
                        break;

                    //for the page-down key
                    case (e.keyCode == 34) :

                        //if this is the seek slider, decrement the index by 10% of the total duration
                        //then round that figure to the nearest index and limit to minimum
                        if(theslider.control.name == 'seek')
                        {
                            if((index = index - Math.round(len / 10)) < 0)
                            {
                                index = 0;
                            }
                        }

                        //else decrememnt the index to the nearest half-way value
                        //which will be the mid-point or the start-point depending on the current value
                        else
                        {
                            var midindex = Math.floor(theslider.options.length / 2);
                            if(index > midindex)
                            {
                                index = midindex;
                            }
                            else
                            {
                                index = 0
                            }
                        }
                        break;

                    //for the home key set the index to min
                    case (e.keyCode == 36) :

                        index = 0;
                        break;
                }
            }

            //then if the modified index is different from the current selected index
            if(index != theslider.index)
            {
                //pass the index to applySliderValue, passing a true valueupdate flag
                //to move the thumb and update the other relevant slider and control properties
                applySliderValue(theslider, index, true);

                //also re-show the tooltip with no buffer and a conditional re-hiding
                //so that it stays permanently visible for as long as the slider is moving
                maybeShowSliderTooltip(theslider, false, function()
                {
                    theslider.buffer = etc.delay(config['tooltip-hide-delay'], function()
                    {
                        maybeHideSliderTooltip(theslider, true);
                    });
                });
            }
        }

        //return false to block any native action, which will prevent
        //text selection caused by the mouse dragging over text while sliding
        return false;
    }

    //after-slide action handler (routed from mouse, keyboard and touch "off" events)
    function afterSlide(e, thetarget, theslider)
    {
        //clear the sliding flag
        theslider.__sliding = false;

        //hide the tooltip, passing the buffer flag to delay its disappearance
        //unless the target is inside the slider's thumb,
        //so that it stays if the mouse is still directly over it
        //(and will subsequently be cleared by its "off" event)
        //nb. we may not actually need this, it might be covered by the
        //spread of other tooltip events; but I'm leaving it here anyway JiC™
        if(!etc.contains(theslider.thumb, thetarget))
        {
            maybeHideSliderTooltip(theslider, true);
        }

        //return true to allow any native action
        return true;
    }


    //update the value of a slider and its tootip and its corresponding control,
    //and move the slider thumb and tooltip to the corresponding offset
    //the value argument is expressed in terms of an option index
    //(the index of the value which this slider position represents)
    //or in terms of the option value itself (from which we derive-back the index)
    function applySliderValue(theslider, value, valueupdate, trackdata)
    {
        //set the default valueupdate flag if undefined
        if(!etc.def(valueupdate)) { valueupdate = true; }

        //set the index to zero by default, for safety
        //in case we don't get a value we can use
        var index = 0;


        //if the value is a string
        if(typeof(value) === 'string')
        {
            //if it's a numeric string then it's probably the value of an
            //underyling control being passed by its reciprocal change event
            //so parse it to an integer and divide by the step, to convert it
            //to an option index, but jic that's NaN then reset it to zero
            //(which in both cases will still be validated below)
            //nb. the control will have a timestep property, which is a
            //numeric version of its step attribute, but fallback just in case
            //nb. this means that if you type say "60" when it's a text field
            //and the step is 5 then the value will instantly change to 12
            //which means you can't type a number of seconds to jump to that time
            //(which is the case with the original next string condition too)
            //but I don't see how that can be helped unless the step is always 1
            //even with special logic, we just don't have that data, ie. the slider
            //only knows what the original value is to within +/- half its step
            if(/^[\d]+$/.test(value))
            {
                if(!isNaN(value = parseInt(value, 10)))
                {
                    value = Math.floor(value / (theslider.control.timestep || parseInt(theslider.control.getAttribute('step'), 10)));
                }
                else
                {
                    value = 0;
                }
            }

            //else it specifies a non-numeric option value,
            //so iterate through the options to look for its index
            else
            {
                etc.each(theslider.options, function(option, i)
                {
                    if(option.value == value)
                    {
                        index = i;
                        return false;
                    }
                });
            }
        }

        //if the value is [now] an integer then it's an option index
        //so check that it's actually valid for this array, then save it to index
        if(!isNaN(value = parseInt(value, 10)) && (value >= 0 && value < theslider.options.length))
        {
            index = value;
        }

        //but if it's too high then change it to the highest index
        //[or anything else will stay at index zero]
        else if(!isNaN(value) && value >= theslider.options.length)
        {
            index = theslider.options.length - 1;
        }


        //now set the updating flag
        //nb. see reciprocal control events in bindSliderEvents for notes on this
        theslider.__updating = true;

        //save the value and index before the change
        //so we can pass them to dispatchEvent to be used as the from data
        var
        fromindex = theslider.index,
        fromvalue = theslider.value;

        //update the slider's value and index
        theslider.index = index;
        theslider.value = theslider.options[index].value;

        //set or update the thumb's ARIA "valuenow" attribute with the new value
        theslider.thumb.setAttribute('aria-valuenow', theslider.value);

        //update the tooltip text with the value parsed with lang
        theslider.tooltip.innerHTML = etc.sprintf(config.lang['slider-' + theslider.control.name],
        {
            '1' : theslider.options[theslider.index].tooltip
        });

        //define ARIA "valuetext" using the tooltip text
        theslider.thumb.setAttribute('aria-valuetext', etc.sprintf(config.lang['slider-' + theslider.control.name],
        {
            '1' : theslider.options[theslider.index].tooltip
        }));

        //update the value of the underlying control
        theslider.control.value = theslider.value;

        //clear the updating flag
        theslider.__updating = false;


        //move the slider thumb and tooltip to the corresponding position
        //passing-on the trackdata if we have it, else getting it afresh (including points data)
        applySliderPosition(theslider, index, (trackdata || getTrackData(theslider)));


        //if the valueupdate flag is true, dispatch two slider events
        //one each for the index and value, passing both old and new values
        if(valueupdate)
        {
            dispatchSliderEvent(theslider, 'index', fromindex, theslider.index);
            dispatchSliderEvent(theslider, 'value', fromvalue, theslider.value);
        }
    }


    //move a slider thumb and tooltip to the left offset corresponding with an option index
    //the position is a proportion of the track width corresponding with that index
    //then adjusted so that the center of the thumb is always bang on the value point
    //(which means it overlaps the track by half its width at either extent)
    //nb. we re-compute these layout values on the fly every time, so that
    //they're sensitive to contextual changes, such as a text-size increase,
    //or any dynamic style modifications that cause the rendered layout to change
    //nb. to make these calculations we have to compute with (options.length - 1)
    //rather than just (options.length), because the values in a slider are
    //the value points, not the blocks in between -- so a slider with 10 steps
    //has 10 value points, but only 9 unit blocks in between min and max
    function applySliderPosition(theslider, index, trackdata)
    {
        //if the index is zero, define the position at the precise far-left
        //also do that if the slider max is zero, which means the thumb
        //will be disabled, so the most appropriate position is at zero
        //but a measured position would put it at the far right
        if(index == 0 || theslider.range.max == 0)
        {
            position = (0 - trackdata.thumb.unit);
        }

        //else if the index represents the slider's max value, define a position at the
        //precise far-right of the slider track; this is so that any sub-pixel discrepancies
        //(caused by the track-width not being perfectly divisible by the number of steps)
        //will only manifest at positions where it's not too obvious (ie. in the middle)
        //while the end positions (where it would be more obvious) are always exact
        else if(index == (theslider.options.length - 1))
        {
            var position = (trackdata.width - trackdata.thumb.unit);
        }

        //otherwise get the position for this index from the trackdata points array
        else
        {
            position = (trackdata.points[index] - trackdata.thumb.unit);
        }

        //apply the left position to the thumb,
        //nb. its top position is always zero, and defined by default style props
        theslider.thumb.style.left = position + 'px';

        //apply a left position to the tooltip so it's centered-over the thumb,
        //then constrain the position if necessary to keep it inside the controls form
        definitelyMoveSliderTooltip(theslider, trackdata);
    }


    //dispatch an API event, by looking through the slider's callbacks dictionary
    //for any defined event-callbacks that apply to the specified property
    //and for each one we find, fire the callback with all the requisite data
    function dispatchSliderEvent(theslider, prop, from, to)
    {
        //run through the API callbacks dictionary, to look for
        //a top-level group object indexed by the specified prop
        etc.each(theslider.callbacks, function(fnlist, key)
        {
            //if we find it, build a new slider-event data object
            //ready to pass to the callbacks that are associated with it
            if(key == prop)
            {
                var data =
                {
                    from        : from,
                    to            : to,
                    theslider    : theslider
                };

                //then run through the list of callback functions
                //and call each one, passing the data object
                etc.each(fnlist, function(fn)
                {
                    fn(data);
                });
            }
        });
    }







    //-- private => slider utility functions --//

    //get the current data for this track, which includes the track width,
    //the thumb offset and unit width (half its width, where its center point is),
    //and the width of each track "unit" (the distance between two value-points)
    //then if the points flag is true or undefined, compile and add
    //the array of value-point positions (the offset of each value-point)
    //nb. we use clientWidth rather than offsetWidth for the track, because the former
    //returns the width inside the borders, whereas the latter is the width outside
    //and since its positioning context is inside the border, that's the value we want
    //nb. in browsers that use the inside-border model, we also need to delete the
    //track clientLeft from the thumb offsetLeft, to equalise the value with other implementations
    function getTrackData(theslider, points)
    {
        var trackdata =
        {
            width        : theslider.track.clientWidth,
            thumb        :
            {
                unit    : (theslider.thumb.offsetWidth / 2),
                /*** WE DON'T NEED THE INSIDE-BORDER-MODEL TEST AS LONG AS CLIENT-LEFT IS ALWAYS ZERO ***//*
                x        : (theslider.thumb.offsetLeft - (defs['inside-border-model'] ? theslider.track.clientLeft : 0)) */
                x        : theslider.thumb.offsetLeft
            }
        };
        trackdata.unit = (trackdata.width / (theslider.options.length - 1));

        if(!etc.def(points, true))
        {
            trackdata.points = [];
            etc.each(theslider.options.length, function(i)
            {
                trackdata.points.push(trackdata.unit * i);
            });
        }

        return trackdata;
    }


    //clear and nullify a referenced timer,
    //if it exists and it's not already null
    function nullifyTimer(timer)
    {
        if(etc.def(timer, null))
        {
            __.clearTimeout(timer);
            __.clearInterval(timer);
            timer = null;
        }
        return timer;
    }


    //verify that a relevant key was pressed so we can implement arrow-key sliding
    function verifySliderKey(e)
    {
        return (e.keyCode >= 33 && e.keyCode <= 40);
    }







    //-- private => tooltip functions --//

    //conditionally create, append and position a button's tooltip, with an
    //optional callback so we have the ability to synchronise tooltip events
    //nb. don't return on these functions so we don't affect the event flow
    //nb. we don't need to do anything special with tooltips when jumping
    //in and out of fullscreen mode, since that action always focusses the
    //fullscreen button, and that event will manage the tooltip appropriately
    //nb. browsers won't fire mouseover for disable buttons, so browsers won't show
    //the "not available" message when applicable for the disabled CC or AD button
    //this is perhaps unfortunate, but there's no way to fix it because
    //even a delegated event won't fire for a disabled button target
    //and it does match the keyboard interactions, since disabled buttons aren't
    //in the tab order, so a keyboard user wouldn't get the tooltip either
    function maybeCreateButtonTooltip(button, buffer, oncomplete)
    {
        //if this is a skip link when images are disabled, don't create a tooltip
        //because its text is exactly the same as the now-visible fallback text
        //nb. since we don't have a player reference we have to check the
        //container class, assuming that it's the control form's parent
        if(button.href && etc.hasClass(button.controlform.parentNode, config.classes['no-images']))
        {
            return;
        }

        //also don't create a tooltip if the button has no aria-label
        //eg. for the mute button with the youtube plugin which has no
        //mute function and is only a volume state indicator
        if(!button.getAttribute('aria-label'))
        {
            return;
        }

        //[else] if CSS is not enabled we don't want to create custom tooltips
        //because they'll just appear as inline text after the button
        //so instead create a temporary title attribute on the button
        //then at least there is a normal tooltip when viewed like this
        //nb. use the element's wrapper span for testing, because
        //it will be inline-block if supported or native inline if not
        //nb. skip links will still get this far if images are supported
        //they're not really needed since the text is the same, but they do
        //no harm, and it's not worth the extra logic to exclude them
        if(!haveCSS(button.parentNode))
        {
            button.setAttribute('title', button.getAttribute('aria-label'));
            return;
        }

        //[else] remove any existing title attribute we may have previously added
        button.removeAttribute('title');

        //iterate through the collection and reset all running buffers
        etc.each(button.controlform.tooltipnodes, function(node)
        {
            node.buffer = nullifyTimer(node.buffer);
        });

        //look for a menu associated with this button which is currently open
        var openmenu = (openmenu = button.controlform['menu-' + button.name]) && openmenu.getAttribute('aria-hidden') == 'false';

        //create a local abstraction for creating, appending and positioning the tooltip
        function addButtonTooltip()
        {
            //hide all the slider tooltips before showing this one
            etc.each(sliders, function(tipslider)
            {
                maybeHideSliderTooltip(tipslider);
            });

            //remove any active tooltip and nullify the tooltipbutton flag
            maybeRemoveButtonTooltip(button.controlform);

            //if we don't have an open menu on this button
            if(!openmenu)
            {
                //update the tooltipbutton flag to reference this button
                button.controlform.tooltipbutton = button;

                //then create a new tooltip after the button using the aria-label text
                //including aria-hidden so that screenreaders don't announce it
                //(for whom the same value is in its aria-label and inner text)
                //and saving it as a property of the button for ease of referencing later
                button.tooltip = etc.build('em',
                {
                    '=parent'       : button.parentNode,
                    'class'         : config.classes['button-tooltip'],
                    'aria-hidden'   : 'true',
                    '#text'         : button.getAttribute('aria-label')
                });

                //move the tooltip to position centered above the button
                definitelyMoveButtonTooltip(button);

                //if an oncomplete callback is defined, fire it now
                if(typeof(oncomplete) === 'function') { oncomplete(); }
            }
        }

        //then if the buffer flag is true and we don't have an open menu on this button
        //start a new show-timer buffer to create the tooltip
        if(buffer === true && !openmenu)
        {
            button.buffer = etc.delay(config['tooltip-show-delay'], function()
            {
                addButtonTooltip();
            });
        }

        //otherwise just create the tooltip immediately
        else
        {
            addButtonTooltip();
        }
    }

    //conditionally remove the current tooltip, with corresponding logic
    function maybeRemoveButtonTooltip(form, buffer)
    {
        //iterate through the collection and reset all running buffers
        etc.each(form.tooltipnodes, function(node)
        {
            node.buffer = nullifyTimer(node.buffer);
        });

        //don't proceed further if there is no current tooltip button
        if(form.tooltipbutton === null) { return; }

        //then if the buffer flag is true, start a new hide-timer buffer to remove the tooltip
        if(buffer === true)
        {
            form.tooltipbutton.buffer = etc.delay(config['tooltip-hide-delay'], function()
            {
                //remove the tooltip button's tooltip and nullify the flag
                etc.remove(form.tooltipbutton.tooltip);
                form.tooltipbutton = null;
            });
        }

        //otherwise just remove it immediately
        else
        {
            //remove the tooltip button's tooltip and nullify the flag
            etc.remove(form.tooltipbutton.tooltip);
            form.tooltipbutton = null;
        }
    }

    //apply a left position to a buttons's tooltip so it's centered (over or under) the button
    //then constrain the position if necessary to keep it inside the controls form
    //nb. we only need to set the left because the top can be done with external CSS
    //nb. the tooltip offset values will only return correctly if it's displayed
    //which is why we use visibility to hide it, and not display
    function definitelyMoveButtonTooltip(button, position)
    {
        button.tooltip.style.left = (button.offsetLeft - (button.tooltip.offsetWidth / 2) + (button.offsetWidth / 2)) + 'px';
        if((position = etc.constrain(button.tooltip, button.controlform).x) !== 0)
        {
            button.tooltip.style.left = (button.tooltip.offsetLeft + position) + 'px';
        }
    }

    //update a button's tooltip text and position while it's visible (if it's visible)
    function updateVisibleButtonTooltip(player, button)
    {
        //if the tooltip for this button is currently visible
        if(player.controlform.tooltipbutton === button)
        {
            //update its text with the button's aria-label
            button.tooltip.firstChild.nodeValue = button.getAttribute('aria-label');

            //move the tooltip to re-center it above the button
            definitelyMoveButtonTooltip(button);
        }
    }


    //conditionally show and position a slider's tooltip, with an
    //optional callback so we have the ability to synchronise tooltip events
    //nb. don't return on these functions so we don't affect the event flow
    function maybeShowSliderTooltip(theslider, buffer, oncomplete)
    {
        //ignore this if the thumb is disabled
        if(theslider.thumb.disabled) { return; }

        //if the tooltip already has a running buffer timer,
        //reset it and nullify the reference
        theslider.buffer = nullifyTimer(theslider.buffer);

        //create a local abstraction for showing and positioning the button
        function showSliderTooltip()
        {
            //remove any active button tooltip and nullify the tooltipbutton flag
            maybeRemoveButtonTooltip(theslider.controlform);

            //hide all the [other] slider tooltips before showing this one
            //so that only one slider tooltip can be visible at one time
            //nb. if you're interacting with one slider, then by definition
            //you've finished with the other, so this isn't unwarranted
            //and I think the result is less visually cluttering
            etc.each(sliders, function(tipslider)
            {
                maybeHideSliderTooltip(tipslider);
            });

            //swap the hidden for visible class to show this tooltip
            etc.swapClass(theslider.tooltip, config.classes['state-hidden'], config.classes['state-visible']);

            //move the tooltip to position centered above its thumb
            definitelyMoveSliderTooltip(theslider, getTrackData(theslider));

            //if an oncomplete callback is defined, fire it now
            if(typeof(oncomplete) === 'function') { oncomplete(); }
        }

        //then if the buffer flag is true, start a new show-timer buffer to show the tooltip
        //nb. the tooltip will usually be positioned already, because we always
        //do that whenever the thumb moves, whether or not the tooltip is visible
        //however it is possible that the player size has changed since the
        //last time you moved the slider (eg. from entering or exiting fullscreen)
        //so we [re-]apply and constrain the position here as well, just to be sure
        //** it would be more efficient to do this positioning only if we know
        //** that the form size has changed since the last time the slider was moved
        //** but in lieu of that, we don't now need to move the tooltip until it's shown
        if(buffer === true)
        {
            theslider.buffer = etc.delay(config['tooltip-show-delay'], function()
            {
                showSliderTooltip();
            });
        }

        //otherwise just show it immediately
        else
        {
            showSliderTooltip();
        }
    }

    //conditionally hide a slider's tooltip, with corresponding logic
    function maybeHideSliderTooltip(theslider, buffer)
    {
        //ignore this if the thumb is disabled
        if(theslider.thumb.disabled) { return; }

        //reset any running buffer timer
        theslider.buffer = nullifyTimer(theslider.buffer);

        //then if the buffer flag is true, start a new hide-timer buffer to hide the tooltip
        if(buffer === true)
        {
            theslider.buffer = etc.delay(config['tooltip-hide-delay'], function()
            {
                //swap the visible for hidden class to hide this tooltip
                etc.swapClass(theslider.tooltip, config.classes['state-visible'], config.classes['state-hidden']);
            });
        }

        //otherwise just hide it immediately
        else
        {
            //swap the visible for hidden class to hide this tooltip
            etc.swapClass(theslider.tooltip, config.classes['state-visible'], config.classes['state-hidden']);
        }
    }

    //apply a left position to a slider's tooltip so it's centered-over the thumb,
    //then constrain the position if necessary to keep it inside the controls form
    //nb. we only need to set the left because the top can be done with external CSS
    //nb. the tooltip offset values will only return correctly if it's displayed
    //which is why we use visibility to hide it, and not display
    function definitelyMoveSliderTooltip(theslider, trackdata, position)
    {
        theslider.tooltip.style.left = (theslider.thumb.offsetLeft - (theslider.tooltip.offsetWidth / 2) + trackdata.thumb.unit) + 'px';
        if((position = etc.constrain(theslider.tooltip, theslider.controlform).x) !== 0)
        {
            theslider.tooltip.style.left = (theslider.tooltip.offsetLeft + position) + 'px';
        }
    }


    //check whether CSS is enabled, which we do by checking the
    //display property of an element with native inline display
    function haveCSS(node)
    {
        return etc.getStyle(node, 'display') != 'inline';
    }







    //-- private => transcript details wrapper polyfill --//

    //add a details polyfill to impement behaviours for the transcript expander
    function addTranscriptExpander(player, expander)
    {
        //get a reference to the inner trigger element, which should be the
        //first child element we reach, but if we don't find that element,
        //or we reach another one first, or it's not a summary element, or it
        //has no inner content, then we can't create the expander, so just exit
        //after first showing a warning message in the console where supported
        var trigger = expander.firstChild;
        while(trigger && trigger.nodeType !== 1)
        {
            trigger = trigger.nextSibling;
        }
        if
        (
            !trigger
            ||
            trigger == player.transcript
            ||
            trigger.nodeName.toLowerCase() != 'summary'
            ||
            !trigger.hasChildNodes()
        )
        {
            return etc.console(config.lang['expander-warning'], 'warn');
        }

        /*** temporary workaround for safari freeze when touching trigger element ***//***
        if(defs.agent.ios)
        {
            var sheet = document.head.appendChild(document.createElement('style')).sheet;
            sheet.insertRule('.ozplayer-expander summary::-webkit-details-marker { display:none; }');
            etc.listen(trigger, 'touchstart', function(e)
            {
                return null;
            });
            return;
        }
        ***/

        //[else] save player references to the expander and trigger
        player.expander = expander;
        player.trigger = trigger;


        //detect native implementations
        //and remember whether the expander has a default "open" attribute
        var
        isnative = typeof(expander.open) == 'boolean',
        isexpanded = expander.getAttribute('open') !== null;

        //nb. originally this had aria-controls pointing to the transcript content ID
        //however aria-controls is not well implemented among screenreaders
        //and created confusing interaction prompts as a results, eg. in JAWS + Firefox
        //the prompt to "Press JAWS key plus Alt plus M to move to controlled element"
        //which then always resulted in the message "Failed to move to controlled element"

        //set tabindex on the trigger so it's keyboard accessible
        //nb. set this using the property name to avoid browser differences
        trigger.tabIndex = 0;

        //set the button role so that screenreaders announce it as such
        //this also ensures that the default expanded state is announced on
        //initial focus (rather than only after it's been changed, as without it)
        //and adds the trigger to the screenreader's quick forms collection
        trigger.setAttribute('role', 'button');

        //set aria-expanded on the trigger and content element according to isexpanded
        //so that its initial state matches that specified by the open attribute
        //nb. originally aria-expanded was defined only the content element
        //however  it turns out that aria-expanded should be on the trigger
        //http://www.marcozehe.de/2010/02/10/easy-aria-tip-5-aria-expanded-and-aria-controls/
        //and with that change, the expanded or collapsed state is correctly announced in NVDA and Jaws 16
        //however is that to specification, or is it a quirk in their implementations?
        //I don't know, so for safety for now, I'm going to define both (even though that
        //might cause tautology, repetitive of information is better than missing information)
        trigger.setAttribute('aria-expanded', isexpanded ? 'true' : 'false');
        player.transcript.setAttribute('aria-expanded', isexpanded ? 'true' : 'false');

        //then set style.display on the transcript to match that state
        player.transcript.style.display = isexpanded ? 'block' : 'none';

        //then if this is not a native implementation, create a twisty inside the trigger
        //with a text-glyph according to isexpanded, and save its reference as a trigger property
        //nb. add aria-hidden to the twisty so that screenreaders don't announce it
        //although this only actually works in JAWS+IE: JAWS+FF still announces it
        //and NVDA+FF and NVDA+IE never announced it in the first place
        //nnb. this would work in JAWS+FF if the trigger didn't have the button role
        //but we need that role on the trigger for the reasons explained above
        if(!isnative)
        {
            trigger.__twisty = etc.build('span',
            {
                '=before'       : trigger.firstChild,
                'aria-hidden'   : 'true',
                '#text'         : getLang(player, 'expander-' + (isexpanded ? 'open' : 'closed'))
            });
        }


        //now define an abstraction to handle cross-modal click events, which we need
        //since some browsers fire click events when pressing enter on the trigger
        //(which has tabindex=0) but some don't, and we don't want those that do
        //to fire their native click events in addition to custom key events
        //nb. we only respond to the Enter key so that other key events aren't treated
        //as part of the same action, eg. keyup from the Tab key after tabbing to the trigger
        //nb. we have to prevent default on repeats without blocking it universally
        //because some native implementations (eg. chrome) use keydown for the close event
        //so if we didn't block it, the repeats would create a conflict between the native and
        //scripted states, but if we blocked it entirely then native implementations wouldn't work
        //and we can't juse ignore native implementations because we need to enhance them with ARIA
        //* nnb. though is still possible to create that conflict if you mouse click with the enter key held down!
        //nb. the iOS code worksaround an issue whereby touching the trigger caused Safari to freeze
        //though it's not at clear why that happens since removing all the custom markup and
        //events didn't prevent the problem, yet the problem doesn't occur in isolation
        //but handling the touch events directly does seem to fix the issue most of the time
        //** however since we're effectively bypassing the native action and toggling it using
        //** our polyfill, yet the discloure triangle is part of the native implementation,
        //** this means that the triangle doesn't change when the transcript opens and closes
        //** also it's possible on the iphone to trigger the native implementation directly
        //** (seems to be, if you touch right on the edge of the summary not in the middle)
        //** and if that happens then the transcript closes and can't be opened again
        //** and occassionally the freeze still happens anyway
        function addCrossModalClick(node, callback)
        {
            if(defs.agent.ios)
            {
                etc.listen(expander, 'touchstart', function(e, thetarget)
                {
                    if(!etc.contains(player.transcript, thetarget))
                    {
                        return false;
                    }
                });
                etc.listen(trigger, 'touchend', function(e, thetarget)
                {
                    callback(e, thetarget);
                    return null;
                });
                return;
            }

            var keydown = false;

            etc.listen(node, 'keydown', function(e)
            {
                if(e.keyCode == 13)
                {
                    if(!keydown)
                    {
                        keydown = true;
                    }
                    else
                    {
                        return false;
                    }
                }
            });
            etc.listen(node, 'keyup', function(e, thetarget)
            {
                if(keydown)
                {
                    keydown = false;
                    callback(e, thetarget);
                }
            });
            etc.listen(node, 'click', function(e, thetarget)
            {
                if(!keydown)
                {
                    callback(e, thetarget);
                }
            });
        }

        //then bind a cross-modal click event to the trigger element
        addCrossModalClick(trigger, function()
        {
            //get the current expanded state from the trigger aria-expanded
            var isexpanded = trigger.getAttribute('aria-expanded') == 'true';

            //then apply the inverted aria-expanded and style.display state
            trigger.setAttribute('aria-expanded', isexpanded ? 'false' : 'true');
            player.transcript.setAttribute('aria-expanded', isexpanded ? 'false' : 'true');
            player.transcript.style.display = isexpanded ? 'none' : 'block';

            //then if we have a twisty, update its glyph to match the new state
            if(trigger.__twisty)
            {
                trigger.__twisty.firstChild.nodeValue = getLang(player, 'expander-' + (isexpanded ? 'closed' : 'open'));
            }
        });
    }







    /*** DEV TMP TEST FOR EXPECTED DATA ***//*
    var str = 'INSIDE "ozplayer.js":\n\n'
        + '$this.supported = ' + $this.supported + '\n'
        + '$this.define = ' + typeof($this.define) + '\n'
        + '$this.Video = ' + typeof($this.Video) + '\n'
        + '$this.Audio = ' + typeof($this.Audio) + '\n'
        + 'config = ' + config + '\n'
        + 'defs = ' + defs + '\n'
        + 'players = ' + players + '\n'
        + 'etc = ' + etc + '\n'
        + '';
    alert(str); */



    //return the public members
    return $this;

//then instantiate with an empty object so it doesn't map to window
}).apply({});
