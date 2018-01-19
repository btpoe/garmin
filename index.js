function throttle(fn, wait, context = null) {
    let last;
    let deferTimer;

    return (...args) => {
        const now = Date.now();

        if (last && now < last + wait) {
            clearTimeout(deferTimer);
            deferTimer = setTimeout(function () {
                last = now;
                fn.apply(context, args);
            }, wait);
        } else {
            last = now;
            fn.apply(context, args);
        }
    };
}

function sign(p1, p2, p3) {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

class Triangle {
    constructor(p1, p2, p3) {
        this.p1 = p1;
        this.p2 = p2;
        this.p3 = p3;
    }

    contains(pt) {
        const b1 = sign(pt, this.p1, this.p2) <= 0;
        const b2 = sign(pt, this.p2, this.p3) <= 0;
        const b3 = sign(pt, this.p3, this.p1) <= 0;

        return b1 === b2 && b2 === b3;
    }
}

function createTriangle(node, p1) {
    const { x, y, right, bottom } = node.getBoundingClientRect();

    const p2 = {};
    const p3 = {};

    if (p1.x >= x && p1.y <= y) {
        p2.x = x;
        p2.y = y;
    } else if (p1.x >= right && p1.y >= y) {
        p2.x = right;
        p2.y = y;
    } else if (p1.x <= right && p1.y >= bottom) {
        p2.x = right;
        p2.y = bottom;
    } else {
        p2.x = x;
        p2.y = bottom;
    }

    if (p1.x <= right && p1.y <= y) {
        p3.x = right;
        p3.y = y;
    } else if (p1.x >= right && p1.y <= bottom) {
        p3.x = right;
        p3.y = bottom;
    } else if (p1.x >= x && p1.y >= bottom) {
        p3.x = x;
        p3.y = bottom;
    } else {
        p3.x = x;
        p3.y = y;
    }

    return new Triangle(p1, p2, p3);
}

function eventVertex(e) {
    return {
        x: e.clientX,
        y: e.clientY,
    };
}

export default function garmin(parentNode, selector, options) {
    if (typeof parentNode === 'string') {
        options = selector;
        selector = parentNode;
        parentNode = document;

    }
    if (!options) {
        options = selector;
        selector = options.selector;
    }

    const {
        onHover = (function () {}),
        onLeave = (function () {}),
        attr = 'garminTarget',
        mouseMoveThreshold = 150,
        idleThreshold = 1500,
        scrollThreshold = window.screen.height / 10,
        forceLeaveEventHook = 'garminLeave',
    } = options;

    let inTriangle = false;
    let cachedEvent = null;

    function doMouseOver(e) {
        const trigger = e.target;
        if (selector ? !trigger.matches(selector) : trigger !== e.currentTarget) return;

        if (inTriangle) {
            cachedEvent = e;

            const onCachedTriggerLeave = () => {
                cachedEvent = null;
                trigger.removeEventListener('mouseleave', onCachedTriggerLeave);
            };

            trigger.addEventListener('mouseleave', onCachedTriggerLeave);
            return;
        }

        const target = document.getElementById(trigger.dataset[attr]);

        if (target) {
            inTriangle = true;

            let inTarget = false;
            let hasLeft = false;
            let mouseMovePageYOffset = window.pageYOffset;
            let idleTimeoutId;

            onHover(e, target, trigger);

            if (e.defaultPrevented) return;

            function leave(evt) {
                if (hasLeft) return;
                onLeave(evt, target, trigger);
                if (evt.defaultPrevented) return;
                hasLeft = true;
            }

            function onWindowScroll() {
                if (Math.abs(window.pageYOffset - mouseMovePageYOffset) < scrollThreshold) return;
                window.dispatchEvent(new CustomEvent(forceLeaveEventHook));
            }

            function onLeaveHook(hookEvt) {
                leave(hookEvt);

                if (hookEvt.defaultPrevented) return;

                cachedEvent = null;
                window.removeEventListener(forceLeaveEventHook, onLeaveHook);
                window.removeEventListener('scroll', onWindowScroll);
            }

            window.addEventListener(forceLeaveEventHook, onLeaveHook);

            const onTriggerLeave = () => {
                trigger.removeEventListener('mouseleave', onTriggerLeave);

                const onTargetEnter = () => {
                    inTarget = true;
                    inTriangle = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    target.removeEventListener('mouseenter', onTargetEnter);
                };

                const onTargetLeave = (evt) => {
                    leave(evt);

                    if (evt.defaultPrevented) return;

                    if (cachedEvent) {
                        cachedEvent.target.dispatchEvent(cachedEvent);
                        cachedEvent = null;
                    }

                    document.removeEventListener('mousemove', onMouseMove);
                    target.removeEventListener('mouseenter', onTargetEnter);
                    target.removeEventListener('mouseleave', onTargetLeave);
                    window.removeEventListener(forceLeaveEventHook, onLeaveHook);
                    window.removeEventListener(forceLeaveEventHook, onLeaveHookCleanup);
                };

                target.addEventListener('mouseenter', onTargetEnter);
                target.addEventListener('mouseleave', onTargetLeave);

                let triangle = createTriangle(target, eventVertex(e));

                const onMouseMove = throttle((moveEvent) => {
                    mouseMovePageYOffset = window.pageYOffset;

                    function moveExit() {
                        if (inTarget) return;
                        inTriangle = false;

                        leave(moveEvent);

                        if (cachedEvent && !moveEvent.defaultPrevented) {
                            cachedEvent.target.dispatchEvent(cachedEvent);
                            cachedEvent = null;
                        }

                        if (moveEvent.defaultPrevented) return;

                        document.removeEventListener('mousemove', onMouseMove);
                        target.removeEventListener('mouseenter', onTargetEnter);
                        window.removeEventListener(forceLeaveEventHook, onLeaveHook);
                        window.removeEventListener(forceLeaveEventHook, onLeaveHookCleanup);
                    }

                    clearTimeout(idleTimeoutId);
                    idleTimeoutId = setTimeout(moveExit, idleThreshold);

                    const p1 = eventVertex(moveEvent);

                    if (!inTarget && triangle.contains(p1)) {
                        triangle = createTriangle(target, p1);
                    } else {
                        moveExit();
                    }
                }, mouseMoveThreshold);

                document.addEventListener('mousemove', onMouseMove);

                function onLeaveHookCleanup(hookEvt) {
                    leave(hookEvt);

                    if (hookEvt.defaultPrevented) return;

                    document.removeEventListener('mousemove', onMouseMove);
                    target.removeEventListener('mouseenter', onTargetEnter);
                    target.removeEventListener('mouseleave', onTargetLeave);
                    window.removeEventListener(forceLeaveEventHook, onLeaveHookCleanup);
                }

                window.addEventListener(forceLeaveEventHook, onLeaveHookCleanup);
            };

            trigger.addEventListener('mouseleave', onTriggerLeave);
            window.addEventListener('scroll', onWindowScroll);
        }
    }

    function onMouseOver(e) {
        const mouseOverTimeout = setTimeout(doMouseOver.bind(null, e), 120);

        function clearTimer() {
            clearTimeout(mouseOverTimeout);
            e.target.removeEventListener('mouseleave', clearTimer);
        }

        e.target.addEventListener('mouseleave', clearTimer);
    }

    function addEvent(node) {
        node.addEventListener('mouseover', onMouseOver);
    }

    function removeEvent(node) {
        node.removeEventListener('mouseover', onMouseOver);
    }

    if (Array.isArray(parentNode) || parentNode instanceof window.NodeList) {
        parentNode.forEach(addEvent);
    } else {
        addEvent(parentNode);
    }

    return {
        destroy() {
            if (Array.isArray(parentNode) || parentNode instanceof window.NodeList) {
                parentNode.forEach(removeEvent);
            } else {
                removeEvent(parentNode);
            }
        }
    }
}
