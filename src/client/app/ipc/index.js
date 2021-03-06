var EventEmitter = require('../events/event-emitter'),
    uuid = require('nanoid/generate')('0123456789abcdefghijklmnopqrstuvwxyABCDEFGHIJKLMNOPQRSTUVWXYZ', 10),
    notifications,
    locales

setTimeout(()=>{
    notifications = require('../ui/notifications')
    locales = require('../locales')
})

var reconnectInterval = 5000,
    hearbeatInterval = 25000,
    hearbeatTimeout = 5000

class Ipc extends EventEmitter {

    constructor() {

        super()

        this.socket = null

        this.queue = []

        this.disconnectedOnce = false
        this.reconnect = undefined

        this.hearbeat = undefined
        this.hearbeatTimeout = undefined
        this.on('pong', ()=>{
            this.hearbeatTimeout = clearTimeout(this.hearbeatTimeout)
        })
        this.on('ping', ()=>{
            this.socket.send('["pong"]')
        })

        try {
            this.open()
        } catch(e) {
            console.warn('Could not open a WebSocket connection')
            console.log(e)
        }

    }

    init() {

        var callbacks = require('./callbacks')

        for (let i in callbacks) {
            let callback = callbacks[i]
            this.on(i, (data)=>{
                callback(data)
            })
        }

    }

    open() {

        this.socket = new WebSocket('ws://' + window.location.host + '/' + uuid)

        this.socket.onopen = (e)=>{

            this.reconnect = clearInterval(this.reconnect)

            this.hearbeat = setInterval(()=>{
                if (!this.connected()) return
                this.socket.send('["ping"]')
                this.hearbeatTimeout = setTimeout(()=>{
                    if (this.connected()) this.socket.close()
                }, hearbeatTimeout)
            }, hearbeatInterval)

            if (notifications && this.disconnectedOnce) notifications.add({
                icon: 'wifi',
                message: locales('server_connected'),
                id: 'ipc_state'
            })

            this.trigger('connect')
            this.flush()

        }

        this.socket.onmessage = (e)=>{
            this.receive(e.data)
        }

        this.socket.onclose = this.socket.onerror = ()=>{
            if (!this.connected()) this.close()
        }

    }

    close() {

        this.socket = null

        this.hearbeat = clearInterval(this.hearbeat)
        this.hearbeatTimeout = clearTimeout(this.hearbeatTimeout)
        this.dieTimeout = clearTimeout(this.dieTimeout)
        notifications.add({
            icon: 'wifi',
            class: 'error',
            message: locales('server_disconnected'),
            id: 'ipc_state',
            duration: Infinity
        })
        this.disconnectedOnce = true
        if (!this.reconnect) {
            this.reconnect = setInterval(()=>{
                this.open()
            }, reconnectInterval)
        }

    }

    connected() {

        return this.socket && this.socket.readyState == this.socket.OPEN

    }

    receive(message) {

        if (typeof message == 'string') {

            var packet = JSON.parse(message)

            if (Array.isArray(packet) && typeof packet[0] == 'string') {

                this.trigger(packet[0], packet[1])

            }

        }

    }

    send(event, data) {

        var packet = JSON.stringify([event, data])

        if (this.connected()) {
            this.socket.send(packet)
        } else {
            this.queue.push(packet)
        }

    }

    flush(){

        for (var i in this.queue) {

            if (this.connected()) this.socket.send(this.queue[i])

        }

        this.queue = []

    }

}

var ipc = new Ipc()

module.exports = ipc
