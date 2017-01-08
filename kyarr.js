"use strict"

const fs = require('fs')
const child_process = require('child_process')
const path = require('path')

const taskSeries = (tasks, callback = null) => {
	if (callback === null)
		callback = () => {}
	let nextTask = (err) => {
		if (err) {
			console.log(err)
			return callback(err)
		}
		if (tasks.length == 0) return callback(null)
		let task = tasks.shift()
		task(nextTask)
	}
	nextTask(null)
}

const delay = (ts, callback) => {
	setTimeout(() => {
		callback(null)
	}, ts)
}

const freeSpace = (callback) => {
	child_process.exec("df /tmp/sdcard", {
		cwd: process.cwd(),
		encoding: 'utf8'
	}, (err, so, se) => {
		if (err) callback(err)
		let d = so.split("\n")[1].split(/\s+/).splice(1, 3)
		callback(null, +d[2])
	})
}

const led = (l, on = true, callback) => {
	fs.writeFile(`/sys/class/leds/${l}_led/brightness`, on ? "255" : "0", callback)
}

const blink = (l, times, callback) => {
	taskSeries([
		(cb) => { led(l, true, cb) },
		(cb) => { delay(100, cb) },
		(cb) => { led(l, false, cb) },
		(cb) => { delay(200, cb) },
	], (err) => {
		if (times <= 1)
			return callback(null)
		blink(l, times - 1, callback)
	})
}

const waitForSdCard = (callback) => {
	console.log(' -- waiting for SD card...')
	taskSeries([
		(cb) => { delay(1000, cb) },
		(cb) => { blink('blue', 5, cb) },
		(cb) => {
			child_process.exec('lsblk -n -l -o NAME', (err, so, se) => {
				if (err) return cb(err)
				if (so.split("\n").some((x) => x === 'mmcblk1'))
					return callback(null)
				else 
					return waitForSdCard(callback)
			})
		}
	])
}

const formatCard = (callback) => {
	console.log(' -- creating partition')
	let sfdisk = child_process.spawn('sfdisk', ['/dev/mmcblk1'], {
		stdio: ['pipe', 'ignore', 'ignore']
	})
	
	// sfdisk.stdout.on('data', (d) => { console.log(d.toString()) })
	// sfdisk.stderr.on('data', (d) => { console.log(d.toString()) })

	sfdisk.on('close', (code) => {
		if (code != 0)
			return callback(code)
		return callback(null)
	})
	
	sfdisk.stdin.end("label: dos\nlabel-id: 0x6b797272\nunit: sectors\n\nstart=8192, type=b\n")
}

const createFilesystem = (callback) => {
	console.log(' -- creating filesystem...')
	child_process.exec('mkfs.vfat -n KYARR /dev/mmcblk1p1', (err, so, se) => {
		if (err) return callback(err)
		callback(null)
	})
}

const umount = (callback) => {
	console.log(' -- unmounting just in case...')
	child_process.exec('umount /tmp/sdcard', (err, so, se) => {
		callback(null)
	})
}

const kill = (callback) => {
	console.log(' -- killing arecord just in case...')
	child_process.exec('killall -9 arecord', (err, so, se) => {
		callback(null)
	})
}

const mount = (callback) => {
	console.log(' -- mounting card...')
	taskSeries([
		(cb) => {
			child_process.exec('mkdir -p /tmp/sdcard', (err, so, se) => {
				cb(err)
			})
		},
		(cb) => {
			child_process.exec('mount -t vfat -o flush /dev/mmcblk1p1 /tmp/sdcard', (err, so, se) => {
				cb(err)
			})
		}
	], callback)
}

const prepareCard = (callback) => {
	taskSeries([
		formatCard,
		createFilesystem
	], callback)
}

const formatIfNeeded = (callback) => {
	console.log(' -- checking if partition exists...')
	child_process.exec('lsblk /dev/mmcblk1p1 -n -l -o NAME,LABEL,FSTYPE', (err, so, se) => {
		if (err) return callback(err)
		if (so.trim() === 'mmcblk1p1 KYARR vfat') {
			console.log(' -- good partition found')
			return callback(null)
		} else {
			return prepareCard(callback)
		}
	})
}

const rmDir = (folder, callback) => {
	child_process.exec(`rm -rf ${folder}`, {
		cwd: process.cwd(),
		encoding: 'utf8'
	}, (err, so, se) => {
		callback(err)
	})
}

const eraseOldestFile = (callback) => {
	let firstDir = null
	let firstFile = null
	taskSeries([
		(cb) => {
			fs.readdir('/tmp/sdcard', (e, list) => {
				list = list.filter((d) => {
					return /^\d{4}-\d{2}-\d{2}$/.test(d)
				})
				list.sort()
				if (list.length) firstDir = list[0]
				cb(null)
			})
		},
		(cb) => {
			console.log(` -- oldest dir ${firstDir}`)
			if (firstDir === null) return cb(null)
			fs.readdir(`/tmp/sdcard/${firstDir}`, (e, list) => {
				list = list.filter((d) => {
					return /^rec-.*\.wav$/.test(d)
				})
				list.sort()
				if (list.length) firstFile = list[0]
				cb(null)
			})
		}
	], (err) => {
		console.log(` -- oldest file ${firstFile}`)
		if (firstDir === null && firstFile === null)
			return callback(null)
		if (firstFile !== null) {
			console.log(` -- deleting ${firstDir}/${firstFile}`)
			return fs.unlink(`/tmp/sdcard/${firstDir}/${firstFile}`, callback)
		}
		console.log(` -- deleting ${firstDir}`)
		rmDir(`/tmp/sdcard/${firstDir}`, (err) => {
			eraseOldestFile(callback)
		})
	})
}

const checkFreeSpace = () => {
	blink('blue', 1, () => {
		freeSpace((e, f) => {
			if (f < 200000) {
				eraseOldestFile((err) => {
					setTimeout(checkFreeSpace, 500)
				})
			} else
				setTimeout(checkFreeSpace, 10000)
		})
	})
}

const checkIfForceFormat = (callback) => {
	fs.stat('/tmp/sdcard/formatme', (err) => {
		if (err) return callback(null)
		console.log(' -- formatme found - forcing format...')
		taskSeries([
			umount,
			prepareCard,
			mount
		], callback)
	})
}

const record = (callback) => {
	console.log(' -- start recording')
	let arecord = child_process.spawn('arecord',[
		'--max-file-time','180',
		'-D','hw:2,0',
		'-t','wav',
		'-c','1',
		'-r','44100',
		'-f','S16_LE',
		'--use-strftime', '/tmp/sdcard/%Y-%m-%d/rec-%H%M%S-%v.wav'
	], {
		stdio: ['ignore', 'ignore', 'pipe']
	})

	arecord.stderr.on('data', (d) => { console.log(d.toString()) })

	arecord.on('close', (code) => {
		process.exit(code)
	})
	callback(null)
	checkFreeSpace()
}

taskSeries([
	(cb) => { led('blue', false, cb) },
	(cb) => { led('green', false, cb) },
	(cb) => { blink('green', 2, cb) },
	(cb) => { blink('blue', 2, cb) },
	(cb) => { blink('green', 2, cb) },
	kill,
	umount,
	waitForSdCard,
	formatIfNeeded,
	mount,
	checkIfForceFormat,
	(cb) => { blink('green', 3, cb) },
	record,
	// prepareCard
])