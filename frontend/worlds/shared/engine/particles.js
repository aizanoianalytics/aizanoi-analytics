import * as THREE from '../vendor/three.module.js';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;

        this.dustParticles = null;
        this.leafParticles = null;
        this.sparkParticles = null;
        this.birdParticles = null;

        this.init();
    }

    init() {
        this._initDust();
        this._initLeaves();
        this._initSparks();
        this._initBirds();
    }

    _initDust() {
        const count = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);

        for(let i=0; i<count; i++) {
            positions[i*3] = (Math.random() - 0.5) * 40;
            positions[i*3+1] = Math.random() * 20;
            positions[i*3+2] = (Math.random() - 0.5) * 40;

            velocities[i*3] = (Math.random() - 0.5) * 0.5;
            velocities[i*3+1] = (Math.random() - 0.5) * 0.5;
            velocities[i*3+2] = (Math.random() - 0.5) * 0.5;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

        const material = new THREE.PointsMaterial({
            color: 0xfffdd0,
            size: 0.1,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.dustParticles = new THREE.Points(geometry, material);
        this.scene.add(this.dustParticles);
    }

    _initLeaves() {
        const count = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);

        for(let i=0; i<count; i++) {
            positions[i*3] = (Math.random() - 0.5) * 60;
            positions[i*3+1] = Math.random() * 20;
            positions[i*3+2] = (Math.random() - 0.5) * 60;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x6a8a50,
            size: 0.3,
            transparent: true,
            opacity: 0.8
        });

        this.leafParticles = new THREE.Points(geometry, material);
        this.scene.add(this.leafParticles);
    }

    _initSparks() {
        const count = 200;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const lifetimes = new Float32Array(count);

        for(let i=0; i<count; i++) {
            positions[i*3] = 0;
            positions[i*3+1] = -100; // hidden initially
            positions[i*3+2] = 0;
            lifetimes[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));

        const material = new THREE.PointsMaterial({
            color: 0xff6600,
            size: 0.2,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.sparkParticles = new THREE.Points(geometry, material);
        this.sparkParticles.visible = false; // Night only
        this.scene.add(this.sparkParticles);
    }

    _initBirds() {
        const count = 10;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const angles = new Float32Array(count);

        for(let i=0; i<count; i++) {
            angles[i] = Math.random() * Math.PI * 2;
            positions[i*3] = Math.cos(angles[i]) * 100;
            positions[i*3+1] = 40 + Math.random() * 20;
            positions[i*3+2] = Math.sin(angles[i]) * 100;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('angle', new THREE.BufferAttribute(angles, 1));

        const material = new THREE.PointsMaterial({
            color: 0x111111,
            size: 0.8,
            transparent: true,
            opacity: 0.8
        });

        this.birdParticles = new THREE.Points(geometry, material);
        this.scene.add(this.birdParticles);
    }

    update(dt, cameraPos, isNight) {
        // Dust
        if (this.dustParticles) {
            const positions = this.dustParticles.geometry.attributes.position.array;
            const velocities = this.dustParticles.geometry.attributes.velocity.array;

            for(let i=0; i<positions.length; i+=3) {
                positions[i] += velocities[i] * dt;
                positions[i+1] += velocities[i+1] * dt;
                positions[i+2] += velocities[i+2] * dt;

                // Wrap around camera
                if(positions[i] - cameraPos.x > 20) positions[i] -= 40;
                if(positions[i] - cameraPos.x < -20) positions[i] += 40;
                if(positions[i+1] > 20) positions[i+1] -= 20;
                if(positions[i+1] < 0) positions[i+1] += 20;
                if(positions[i+2] - cameraPos.z > 20) positions[i+2] -= 40;
                if(positions[i+2] - cameraPos.z < -20) positions[i+2] += 40;
            }
            this.dustParticles.geometry.attributes.position.needsUpdate = true;
            this.dustParticles.visible = !isNight;
        }

        // Leaves
        if (this.leafParticles) {
            const positions = this.leafParticles.geometry.attributes.position.array;
            for(let i=0; i<positions.length; i+=3) {
                positions[i+1] -= dt * 2.0;
                positions[i] += Math.sin(positions[i+1] * 0.5) * dt * 2.0;
                positions[i+2] += Math.cos(positions[i+1] * 0.5) * dt * 2.0;

                if(positions[i+1] < 0) {
                    positions[i+1] = 20 + Math.random() * 10;
                    positions[i] = cameraPos.x + (Math.random() - 0.5) * 60;
                    positions[i+2] = cameraPos.z + (Math.random() - 0.5) * 60;
                }
            }
            this.leafParticles.geometry.attributes.position.needsUpdate = true;
        }

        // Sparks
        if (this.sparkParticles) {
            this.sparkParticles.visible = isNight;
            if (isNight) {
                const positions = this.sparkParticles.geometry.attributes.position.array;
                const lifetimes = this.sparkParticles.geometry.attributes.lifetime.array;

                for(let i=0; i<lifetimes.length; i++) {
                    lifetimes[i] -= dt * 0.5;
                    positions[i*3+1] += dt * 3.0;
                    positions[i*3] += (Math.random() - 0.5) * dt * 2.0;
                    positions[i*3+2] += (Math.random() - 0.5) * dt * 2.0;

                    if (lifetimes[i] < 0) {
                        lifetimes[i] = 1.0;
                        positions[i*3+1] = 2.0; // Assume torches are around y=2
                        positions[i*3] = cameraPos.x + (Math.random() - 0.5) * 40;
                        positions[i*3+2] = cameraPos.z + (Math.random() - 0.5) * 40;
                    }
                }
                this.sparkParticles.geometry.attributes.position.needsUpdate = true;
                this.sparkParticles.geometry.attributes.lifetime.needsUpdate = true;
            }
        }

        // Birds
        if (this.birdParticles) {
            const positions = this.birdParticles.geometry.attributes.position.array;
            const angles = this.birdParticles.geometry.attributes.angle.array;

            for(let i=0; i<angles.length; i++) {
                angles[i] += dt * 0.1;
                positions[i*3] = cameraPos.x + Math.cos(angles[i]) * 100;
                positions[i*3+2] = cameraPos.z + Math.sin(angles[i]) * 100;
            }
            this.birdParticles.geometry.attributes.position.needsUpdate = true;
            this.birdParticles.geometry.attributes.angle.needsUpdate = true;
            this.birdParticles.visible = !isNight;
        }
    }
}
