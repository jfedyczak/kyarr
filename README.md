# kyarr

## Installation instructions

### NanoPi NEO Air

#### Flash eMMC (from SD-booted system)

	# dd if=nanopi-air-core-qte-sd4g-20161213.img of=/dev/mmcblk1 bs=1M
	# apt-get install parted
	# parted /dev/mmcblk1
	(parted) print
	(parted) resizepart 2 100%
	(parted) quit
	# resize2fs /dev/mmcblk1p2

#### Setup WiFi

	# mount /dev/mmcblk1p2 /mnt/
	# cd /etc/wpa_supplicant
	# cp /etc/wpa_supplicant/wpa_supplicant.conf ./
	# cat wpa_supplicant.conf
	ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
	update_config=1
	network={
	        ssid="ESSID"
	        psk="PASSWORD"
	}
	# umount /mnt/

#### Tools Installation

After removing SD card and rebooting into eMMC:

	# apt-get install alsa-base
	# timedatectl set-timezone Europe/Warsaw
	# apt-get install dosfstools
	# apt-get install avahi-daemontools

## SD card management

### Creating new partition map

Partition script `clear.sfdisk`:

	label: dos
	label-id: 0x6b797272
	unit: sectors

	start=8192, type=b

Where `0x6b797272` is a magic number of your choice. Apply partition script:

	# sfdisk /dev/mmcblk1 < clear.sfdisk

Format partition:

	# mkfs.vfat -n KYARR /dev/mmcblk1p1

## Recording instructions

	arecord -l

This gives:

	**** List of CAPTURE Hardware Devices ****
	card 1: sndhdmi [sndhdmi], device 0: SUNXI-HDMIAUDIO sndhdmi-0 []
	Subdevices: 1/1
	Subdevice #0: subdevice #0
	card 2: Microphone [Logitech USB Microphone], device 0: USB Audio [USB Audio]
	Subdevices: 1/1
	Subdevice #0: subdevice #0

Then use `-D hw:2,0` to record from card 2, device 0:


	arecord --max-file-time 180 -D hw:2,0 -t wav -c 1 -r 44100 -f S16_LE --use-strftime /mnt/%Y-%m-%d/rec-%H%M%S-%v.wav

It will create new file every `180` seconds.
