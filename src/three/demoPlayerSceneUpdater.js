import * as THREE from 'three';
import { createTacticalPoint, updateTacticalPoint } from './tacticalPoint.js';
import { demoEquipmentKind, demoEventPlayerMatches, demoPlayerReload } from '../demo/playerState.js';
import { demoRosterRuntime } from './runtime.js';
import { floorVisibilityAtY } from './floorFade.js';

// Synchronizes parsed demo players with their reusable scene markers and movement trails.
export default function createDemoPlayerSceneUpdater({
  scene,
  demoPlayers,
  demoMarkers,
  demoMovementTrails,
  refs,
  floorFadeRef,
  aimRaycaster,
  getModelCenter,
  getCamera,
  getRenderer,
  getCollisionMeshes,
  getCollisionVersion,
}) {
  const demoFlashedHeadColor = new THREE.Color('#e4e7e5');
  const {
    snapshot: demoSnapshotRef,
    snapshots: demoSnapshotsRef,
    tick: demoTickRef,
    fires: demoFiresRef,
    hurts: demoHurtsRef,
    inEyePlayer: demoInEyePlayerRef,
    utilityFirstPerson: utilityFirstPersonRef,
    showNames: showDemoNamesRef,
    hoveredPlayer: hoveredDemoPlayerRef,
  } = refs;

  return () => {
    const modelCenter = getModelCenter();
    const camera = getCamera();
    const renderer = getRenderer();
    const collisionMeshes = getCollisionMeshes();
    const collisionVersion = getCollisionVersion();
    const snapshot = demoSnapshotRef.current;
    if (!snapshot) { demoPlayers.visible = false; return; }
    demoPlayers.visible = true;
    const activeNames = new Set();
    snapshot.players.forEach((player) => {
      // A broken controller→pawn link can leave a valid roster player without coordinates.
      if (!player.name || player.hasPosition === false || ![player.position?.x, player.position?.y, player.position?.z].every(Number.isFinite)) return;
      const displaySide = player.team === 2 ? 'T' : 'CT';
      activeNames.add(player.name);
      let marker = demoMarkers.get(player.name);
      if (!marker) {
        const direction = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(player.yaw || 0)), 0, Math.cos(THREE.MathUtils.degToRad(player.yaw || 0)));
        marker = createTacticalPoint(new THREE.Vector3(), direction, `demo-${player.name}`, 5.25, displaySide, 'T');
        marker.scale.setScalar(1.35);
         marker.userData.playerName = player.name;
         marker.userData.demoPitch = player.pitch || 0;
         marker.userData.demoYaw = player.yaw || 0;
           const bodyMaterial = new THREE.MeshStandardMaterial({ color: displaySide === 'CT' ? '#5da9ff' : '#ffb347', roughness: 0.72, metalness: 0.04, transparent: true, opacity: 0.82 });
           const headMaterial = bodyMaterial.clone();
           marker.userData.demoBodyMaterial = bodyMaterial;
           marker.userData.demoHeadMaterial = headMaterial;
         const standingBody = new THREE.Group();
         standingBody.userData.demoStandingBody = true;
         const standingTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.82, 16), bodyMaterial);
         standingTorso.position.y = 0.52;
          const standingHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), headMaterial);
         standingHead.position.y = 1.1;
         standingBody.add(standingTorso, standingHead);
         const crouchedBody = new THREE.Group();
         crouchedBody.userData.demoCrouchedBody = true;
         const crouchedTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.38, 0.58, 16), bodyMaterial);
         crouchedTorso.position.y = 0.36;
          const crouchedHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), headMaterial);
          crouchedHead.position.y = 0.78;
          crouchedBody.add(crouchedTorso, crouchedHead);
          const equipment = new THREE.Group();
          equipment.userData.demoEquipment = true;
          equipment.position.set(0, 0.72, -0.4);
          const equipmentMaterial = new THREE.MeshStandardMaterial({ color: '#38423d', roughness: 0.82, metalness: 0.24 });
           const utilityMaterial = new THREE.MeshStandardMaterial({ color: '#65706a', roughness: 0.64, metalness: 0.36 });
           const utilitySmoke = new THREE.Group();
           utilitySmoke.userData.demoEquipmentKind = 'utility-smoke';
           utilitySmoke.position.set(0.18, 0, -0.06);
           const smokeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 12), utilityMaterial);
           const smokeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 10), equipmentMaterial);
           smokeCap.position.y = 0.18;
           utilitySmoke.add(smokeBody, smokeCap);
           const makeThinGrenade = (kind, color) => {
             const group = new THREE.Group();
             group.userData.demoEquipmentKind = `utility-${kind}`;
             group.position.set(0.18, 0, -0.06);
             const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.42 });
             const body = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.34, 10), material);
             const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), equipmentMaterial);
             cap.position.y = 0.19;
             group.add(body, cap);
             return group;
           };
           const utilityFlash = makeThinGrenade('flash', '#c9cec8');
           const utilityDecoy = makeThinGrenade('decoy', '#64716a');
           const utilityHe = new THREE.Group();
           utilityHe.userData.demoEquipmentKind = 'utility-he';
           utilityHe.position.set(0.18, 0, -0.06);
           const heBody = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), new THREE.MeshStandardMaterial({ color: '#4f6253', roughness: 0.72, metalness: 0.18 }));
           const heFuse = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.09, 8), equipmentMaterial);
           heFuse.position.y = 0.14;
           utilityHe.add(heBody, heFuse);
           const utilityFire = new THREE.Group();
           utilityFire.userData.demoEquipmentKind = 'utility-fire';
           utilityFire.position.set(0.18, 0, -0.06);
           utilityFire.rotation.z = -0.12;
           const bottleMaterial = new THREE.MeshStandardMaterial({ color: '#7f4b32', roughness: 0.4, metalness: 0.08, transparent: true, opacity: 0.88 });
           const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.105, 0.3, 12), bottleMaterial);
           const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.06, 0.13, 10), bottleMaterial);
           bottleNeck.position.y = 0.205;
           const bottleMouth = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.035, 10), equipmentMaterial);
           bottleMouth.position.y = 0.285;
           const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.025), new THREE.MeshStandardMaterial({ color: '#d0b28a', roughness: 0.96 }));
           cloth.position.set(0.045, 0.22, 0);
           cloth.rotation.z = -0.42;
           utilityFire.add(bottleBody, bottleNeck, bottleMouth, cloth);
          const rifle = new THREE.Group();
          rifle.userData.demoEquipmentKind = 'rifle';
          const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.17, 0.62), equipmentMaterial);
          rifleBody.position.z = -0.19;
          const rifleStock = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.2), equipmentMaterial);
          rifleStock.position.set(0, 0, 0.2);
          const rifleBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), equipmentMaterial);
          rifleBarrel.position.z = -0.7;
          const rifleMagazine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.13), equipmentMaterial);
          rifleMagazine.position.set(0, -0.17, -0.18);
          rifle.add(rifleBody, rifleStock, rifleBarrel, rifleMagazine);
          const pistol = new THREE.Group();
          pistol.userData.demoEquipmentKind = 'pistol';
          pistol.position.set(0.14, 0, 0);
          const pistolSlide = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.38), equipmentMaterial);
          pistolSlide.position.z = -0.18;
          const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.27, 0.14), equipmentMaterial);
          pistolGrip.position.set(0, -0.16, -0.02);
          pistolGrip.rotation.x = -0.2;
          pistol.add(pistolSlide, pistolGrip);
          const sniper = new THREE.Group();
          sniper.userData.demoEquipmentKind = 'sniper';
          const sniperBody = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.17, 0.72), equipmentMaterial);
          sniperBody.position.z = -0.24;
          const sniperBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.82, 8), equipmentMaterial);
          sniperBarrel.rotation.x = Math.PI / 2;
          sniperBarrel.position.z = -0.98;
          const sniperScope = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 10), equipmentMaterial);
          sniperScope.rotation.x = Math.PI / 2;
          sniperScope.position.set(0, 0.14, -0.25);
          const sniperStock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.3), equipmentMaterial);
          sniperStock.position.z = 0.27;
          sniper.add(sniperBody, sniperBarrel, sniperScope, sniperStock);
          const smg = new THREE.Group();
          smg.userData.demoEquipmentKind = 'smg';
          smg.position.x = 0.08;
          const smgBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.46), equipmentMaterial);
          smgBody.position.z = -0.16;
          const smgBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), equipmentMaterial);
          smgBarrel.position.z = -0.53;
          const smgGrip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, 0.11), equipmentMaterial);
          smgGrip.position.set(0, -0.2, -0.14);
          const smgForegrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.09), equipmentMaterial);
          smgForegrip.position.set(0, -0.15, -0.4);
          smg.add(smgBody, smgBarrel, smgGrip, smgForegrip);
          const shotgun = new THREE.Group();
          shotgun.userData.demoEquipmentKind = 'shotgun';
          const shotgunStock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.35), equipmentMaterial);
          shotgunStock.position.z = 0.2;
          const shotgunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.95, 8), equipmentMaterial);
          shotgunBarrel.rotation.x = Math.PI / 2;
          shotgunBarrel.position.set(0, 0.06, -0.58);
          const shotgunTube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), equipmentMaterial);
          shotgunTube.rotation.x = Math.PI / 2;
          shotgunTube.position.set(0, -0.07, -0.48);
          const shotgunPump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.3), equipmentMaterial);
          shotgunPump.position.z = -0.38;
          shotgun.add(shotgunStock, shotgunBarrel, shotgunTube, shotgunPump);
          const machinegun = new THREE.Group();
          machinegun.userData.demoEquipmentKind = 'machinegun';
          const machineBody = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.27, 0.62), equipmentMaterial);
          machineBody.position.z = -0.2;
          const machineBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 8), equipmentMaterial);
          machineBarrel.rotation.x = Math.PI / 2;
          machineBarrel.position.z = -0.86;
          const machineBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.32), equipmentMaterial);
          machineBox.position.set(0.16, -0.24, -0.13);
          const machineStock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.3), equipmentMaterial);
          machineStock.position.z = 0.28;
          machinegun.add(machineBody, machineBarrel, machineBox, machineStock);
          const melee = new THREE.Group();
          melee.userData.demoEquipmentKind = 'melee';
          melee.position.set(0.16, 0.05, -0.05);
          melee.rotation.z = -0.12;
          const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), equipmentMaterial);
          knifeHandle.position.y = -0.12;
          const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 0.14), new THREE.MeshStandardMaterial({ color: '#c6d0ca', roughness: 0.38, metalness: 0.75 }));
          knifeBlade.position.set(0, 0.27, -0.03);
          melee.add(knifeHandle, knifeBlade);
          const heldC4 = new THREE.Group();
          heldC4.userData.demoEquipmentKind = 'c4';
          const heldC4Body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.16), new THREE.MeshStandardMaterial({ color: '#4b3831', roughness: 0.75, metalness: 0.15 }));
          const heldC4Display = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.025), new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
          heldC4Display.position.set(0, 0.02, -0.09);
          heldC4.add(heldC4Body, heldC4Display);
          const defuseHands = new THREE.Group();
          defuseHands.userData.demoDefuseHands = true;
          const handMaterial = new THREE.MeshStandardMaterial({ color: '#d6a078', roughness: 0.8 });
          const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7), handMaterial);
          leftHand.userData.demoDefuseHand = -1;
          const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7), handMaterial);
          rightHand.userData.demoDefuseHand = 1;
          defuseHands.add(leftHand, rightHand);
          const defuseKit = new THREE.Group();
          defuseKit.userData.demoDefuseKit = true;
          const toolMaterial = new THREE.MeshStandardMaterial({ color: '#68c7b5', roughness: 0.48, metalness: 0.65 });
          const toolPivot = new THREE.Group();
          toolPivot.userData.demoDefuseToolPivot = true;
          const toolLeft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.46), toolMaterial);
          toolLeft.position.x = -0.055;
          toolLeft.rotation.z = -0.14;
          const toolRight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.46), toolMaterial);
          toolRight.position.x = 0.055;
          toolRight.rotation.z = 0.14;
          const toolJoint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), equipmentMaterial);
          toolJoint.position.z = -0.08;
          toolPivot.add(toolLeft, toolRight, toolJoint);
          defuseKit.add(toolPivot);
           equipment.add(utilitySmoke, utilityFlash, utilityDecoy, utilityHe, utilityFire, rifle, pistol, sniper, smg, shotgun, machinegun, melee, heldC4, defuseHands, defuseKit);
          marker.add(standingBody, crouchedBody, equipment);
         demoPlayers.add(marker);
         demoMarkers.set(player.name, marker);
         const canvas = document.createElement('canvas');
         canvas.width = 512; canvas.height = 96;
         const context = canvas.getContext('2d');
         context.font = 'bold 34px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
         context.fillStyle = '#f2f7ee'; context.strokeStyle = '#08100b'; context.lineWidth = 8;
         context.strokeText(player.name, 256, 48); context.fillText(player.name, 256, 48);
          const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false }));
          label.scale.set(6.3, 1.17, 1); label.position.set(0, 2.8, 0); label.renderOrder = 30;
          label.userData.demoNameLabel = true;
          label.raycast = () => {};
          marker.add(label);
      }
      marker.position.set(player.position.x - modelCenter.x, player.position.y - modelCenter.y + 0.16, player.position.z - modelCenter.z);
       updateTacticalPoint(marker, displaySide, 'T');
        const recentHurt = [...demoHurtsRef.current].reverse().find((event) => demoEventPlayerMatches(event, player) && demoTickRef.current >= event.tick && demoTickRef.current - event.tick < 10);
        const hitGroup = recentHurt?.hitgroup ?? recentHurt?.hit_group;
        const headshotHurt = Number(hitGroup) === 1 || String(hitGroup || '').toLowerCase() === 'head';
        const sideColor = displaySide === 'CT' ? '#5da9ff' : '#ffb347';
        const flashDuration = Math.max(0, Number(player.flashDuration) || 0);
        const flashProgress = flashDuration / Math.max(0.01, Number(player.flashInitialDuration) || flashDuration);
        const flashStrength = Number(player.flashMaxAlpha) > 0 ? THREE.MathUtils.clamp(Number(player.flashMaxAlpha) / 255, 0, 1) : flashDuration > 0 ? 1 : 0;
        const headFlash = flashStrength * THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(flashProgress, 0, 1), 0, 1) * 0.82;
        marker.userData.demoBodyMaterial?.color.set(recentHurt ? '#ff352f' : sideColor);
        marker.userData.demoHeadMaterial?.color.set(recentHurt && headshotHurt ? '#ff352f' : sideColor).lerp(demoFlashedHeadColor, recentHurt && headshotHurt ? 0 : headFlash);
      const direction = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(player.yaw || 0)), 0, Math.cos(THREE.MathUtils.degToRad(player.yaw || 0)));
      marker.rotation.y = direction.lengthSq() ? Math.atan2(-direction.x, -direction.z) : marker.rotation.y;
       marker.userData.demoPitch = player.pitch || 0;
       marker.userData.demoYaw = player.yaw || 0;
       const duckAmount = THREE.MathUtils.clamp(player.duckAmount || 0, 0, 1);
        const standingBody = marker.children.find((child) => child.userData.demoStandingBody);
        const crouchedBody = marker.children.find((child) => child.userData.demoCrouchedBody);
         const hiddenInEye = (utilityFirstPersonRef.current?.player || demoInEyePlayerRef.current)?.name === player.name;
        marker.children.forEach((child) => { if (child.userData.tacticalPoint || child.userData.symbol) child.visible = !hiddenInEye; });
        if (standingBody) standingBody.visible = !hiddenInEye && duckAmount < 0.5;
         if (crouchedBody) crouchedBody.visible = !hiddenInEye && duckAmount >= 0.5;
        const equipment = marker.children.find((child) => child.userData.demoEquipment);
         if (equipment) {
            equipment.visible = !hiddenInEye;
           const defusing = Boolean(player.defusing);
           const weaponKind = demoEquipmentKind(player.activeWeapon);
           const reload = demoPlayerReload(demoRosterRuntime.reloads, player, demoTickRef.current);
           const reloadDrop = reload && !['melee', 'c4'].includes(weaponKind) && !weaponKind.startsWith('utility-') ? Math.sin(reload.progress * Math.PI) : 0;
           equipment.position.y = 0.72 - duckAmount * 0.28 - reloadDrop * 0.36;
           equipment.rotation.x = reloadDrop * 0.72;
           equipment.children.forEach((child) => { child.visible = child.userData.demoEquipmentKind === weaponKind && !defusing; });
          const defuseHands = equipment.children.find((child) => child.userData.demoDefuseHands);
          const defuseKit = equipment.children.find((child) => child.userData.demoDefuseKit);
          if (defuseHands) {
            defuseHands.visible = defusing && !player.hasDefuser;
            const phase = demoTickRef.current * 0.24;
            defuseHands.children.forEach((hand) => hand.position.set(hand.userData.demoDefuseHand * (0.15 + Math.sin(phase) * 0.035), Math.sin(phase + hand.userData.demoDefuseHand * Math.PI * 0.5) * 0.06, -0.08 - Math.cos(phase) * 0.04));
          }
          if (defuseKit) {
            defuseKit.visible = defusing && player.hasDefuser;
            const pivot = defuseKit.children.find((child) => child.userData.demoDefuseToolPivot);
            if (pivot) { pivot.position.x = Math.sin(demoTickRef.current * 0.22) * 0.16; pivot.rotation.y = Math.sin(demoTickRef.current * 0.18) * 0.32; }
          }
        }
       const nameLabel = marker.children.find((child) => child.userData.demoNameLabel);
        if (nameLabel) {
          nameLabel.visible = !hiddenInEye && Boolean(showDemoNamesRef.current || hoveredDemoPlayerRef.current === player.name);
          const labelWorldPosition = marker.localToWorld(nameLabel.position.clone());
          const viewDepth = Math.max(0.1, -labelWorldPosition.applyMatrix4(camera.matrixWorldInverse).z);
          const viewportHeight = Math.max(1, renderer.domElement.clientHeight);
          const worldHeight = 2 * viewDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (36 / viewportHeight);
          const parentScale = marker.getWorldScale(new THREE.Vector3());
          const localHeight = worldHeight / Math.max(0.001, parentScale.y);
          nameLabel.scale.set(localHeight * (512 / 96), localHeight, 1);
        }
        const aimRay = marker.children.find((child) => child.userData.aimRay);
         if (aimRay) {
           aimRay.visible = !hiddenInEye;
           aimRay.material.color.set(player.scoped ? '#ff352f' : displaySide === 'CT' ? '#5da9ff' : '#ffb347');
          const pitch = THREE.MathUtils.degToRad(player.pitch || 0);
          const origin = new THREE.Vector3(0, 0.93 - duckAmount * 0.339, -0.42);
          aimRay.position.copy(origin);
          aimRay.rotation.set(-pitch, 0, 0);
          const collisionKey = `${snapshot.tick}:${collisionVersion}`;
          if (marker.userData.aimCollisionKey !== collisionKey) {
            marker.userData.aimCollisionKey = collisionKey;
            const lineOrigin = new THREE.Vector3(0, 0.15, 0).applyEuler(aimRay.rotation).add(origin);
            const worldOrigin = marker.localToWorld(lineOrigin.clone());
            const worldDirection = new THREE.Vector3(0, 0, -1).applyEuler(aimRay.rotation).applyQuaternion(marker.quaternion).normalize();
            aimRaycaster.set(worldOrigin, worldDirection);
            aimRaycaster.near = 0.05;
            aimRaycaster.far = 72;
            const worldLength = Math.max(0.05, (aimRaycaster.intersectObjects(collisionMeshes, false)[0]?.distance ?? 72) - 0.03);
            const worldScale = marker.getWorldScale(new THREE.Vector3()).z || 1;
            marker.userData.aimCollisionLength = worldLength / worldScale;
          }
          const length = marker.userData.aimCollisionLength ?? 72;
          aimRay.scale.z = length;
          marker.userData.aimTarget.visible = !hiddenInEye;
          marker.userData.aimTarget?.position.copy(new THREE.Vector3(0, 0.15, -length).applyEuler(aimRay.rotation).add(origin));
       }
       if (!marker.userData.muzzleFlash) {
        marker.userData.muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true }));
        marker.userData.muzzleFlash.position.set(0, 0.28, -0.42);
        marker.add(marker.userData.muzzleFlash);
      }
      const firing = demoFiresRef.current.some((event) => event.user_name === player.name && demoTickRef.current >= event.tick && demoTickRef.current - event.tick < 8);
        marker.userData.muzzleFlash.visible = firing && !hiddenInEye;
       marker.userData.muzzleFlash.scale.setScalar(firing ? 1 + Math.sin(performance.now() * 0.04) * 0.35 : 0.01);
       let movementTrail = demoMovementTrails.get(player.name);
       if (!movementTrail) {
         const geometry = new THREE.BufferGeometry();
         geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
         geometry.setAttribute('puffSize', new THREE.Float32BufferAttribute(new Float32Array(12), 1));
         geometry.setAttribute('puffOpacity', new THREE.Float32BufferAttribute(new Float32Array(12), 1));
         geometry.setDrawRange(0, 0);
         const material = new THREE.ShaderMaterial({
           transparent: true,
           depthTest: true,
           depthWrite: false,
           uniforms: { color: { value: new THREE.Color('#eef1eb') } },
           vertexShader: `attribute float puffSize; attribute float puffOpacity; varying float vOpacity; void main(){ vec4 viewPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewPosition; gl_PointSize = puffSize * (300.0 / max(1.0, -viewPosition.z)); vOpacity = puffOpacity; }`,
           fragmentShader: `uniform vec3 color; varying float vOpacity; void main(){ vec2 p = gl_PointCoord - 0.5; float a = 1.0 - smoothstep(0.18, 0.42, length(p - vec2(-0.12, 0.02))); float b = 1.0 - smoothstep(0.14, 0.34, length(p - vec2(0.16, 0.08))); float c = 1.0 - smoothstep(0.12, 0.3, length(p - vec2(0.02, -0.14))); float alpha = max(a, max(b, c)) * vOpacity; if(alpha < 0.02) discard; gl_FragColor = vec4(color, alpha); }`,
         });
         movementTrail = new THREE.Points(geometry, material);
         movementTrail.frustumCulled = false;
         movementTrail.renderOrder = 5;
         scene.add(movementTrail);
         demoMovementTrails.set(player.name, movementTrail);
       }
       const awpScoped = player.scoped && String(player.activeWeapon || '').toLowerCase().includes('awp');
       const recentPlayerPositions = demoSnapshotsRef.current.filter((record) => record.tick <= snapshot.tick && record.tick >= snapshot.tick - 24).map((record) => record.players.find((candidate) => candidate.name === player.name)).filter(Boolean);
       const oldestPosition = recentPlayerPositions[0]?.position;
       const newestPosition = recentPlayerPositions.at(-1)?.position;
       const moving = oldestPosition && newestPosition ? Math.hypot(newestPosition.x - oldestPosition.x, newestPosition.z - oldestPosition.z) > 0.08 : Number(player.velocity) > 5 || Math.hypot(Number(player.velocityX) || 0, Number(player.velocityY) || 0) > 5;
       if (movementTrail.userData.lastTick != null && snapshot.tick < movementTrail.userData.lastTick) movementTrail.userData.movingUntilTick = snapshot.tick;
       movementTrail.userData.lastTick = snapshot.tick;
       if (moving) movementTrail.userData.movingUntilTick = snapshot.tick + 24;
       const movementActive = snapshot.tick <= (movementTrail.userData.movingUntilTick ?? -1);
        const showMovementTrail = !hiddenInEye && player.health > 0 && movementActive && !player.walking && duckAmount < 0.5 && !awpScoped;
       if (showMovementTrail) {
         const sourceRecords = demoSnapshotsRef.current.filter((record) => record.tick <= snapshot.tick && record.tick >= snapshot.tick - 88).map((record) => ({ tick: record.tick, player: record.players.find((candidate) => candidate.name === player.name) })).filter((record) => record.player);
         const samplePosition = (targetTick) => {
           let before = sourceRecords[0];
           let after = sourceRecords.at(-1);
           for (let index = 1; index < sourceRecords.length; index += 1) if (sourceRecords[index].tick >= targetTick) { before = sourceRecords[index - 1]; after = sourceRecords[index]; break; }
           if (!before || !after) return null;
           const amount = before.tick === after.tick ? 0 : THREE.MathUtils.clamp((targetTick - before.tick) / (after.tick - before.tick), 0, 1);
           return { tick: targetTick, position: { x: THREE.MathUtils.lerp(before.player.position.x, after.player.position.x, amount), y: THREE.MathUtils.lerp(before.player.position.y, after.player.position.y, amount), z: THREE.MathUtils.lerp(before.player.position.z, after.player.position.z, amount) } };
         };
         const records = Array.from({ length: 12 }, (_, index) => samplePosition(snapshot.tick - 8 - index * 6)).filter(Boolean).reverse();
         const positions = movementTrail.geometry.attributes.position;
         const sizes = movementTrail.geometry.attributes.puffSize;
         const opacities = movementTrail.geometry.attributes.puffOpacity;
         const playerSeed = [...player.name].reduce((sum, character) => sum + character.charCodeAt(0), 0);
         records.forEach((record, index) => {
           const age = THREE.MathUtils.clamp((snapshot.tick - record.tick) / 64, 0, 1);
           const seed = playerSeed + index * 97;
           const drift = Math.sin(seed * 1.73 + demoTickRef.current * 0.025) * 0.055 * age;
           const sizeVariation = 0.78 + (Math.sin(seed * 2.41) * 0.5 + 0.5) * 0.55;
           positions.setXYZ(index, record.position.x - modelCenter.x + drift, record.position.y - modelCenter.y + 0.16 + age * 0.24, record.position.z - modelCenter.z + Math.cos(seed * 1.21) * 0.065 * age);
           sizes.setX(index, THREE.MathUtils.lerp(1.8, 3.8, age) * sizeVariation);
            const worldY = record.position.y - modelCenter.y + 0.16 + age * 0.24;
            opacities.setX(index, 0.58 * Math.pow(1 - age, 1.25) * floorVisibilityAtY(worldY, floorFadeRef.current));
         });
         positions.needsUpdate = true;
         sizes.needsUpdate = true;
         opacities.needsUpdate = true;
         movementTrail.geometry.setDrawRange(0, records.length);
       }
       movementTrail.visible = showMovementTrail && movementTrail.geometry.drawRange.count > 0;
       marker.visible = player.health > 0;
     });
     demoMarkers.forEach((marker, name) => { if (!activeNames.has(name)) marker.visible = false; });
     demoMovementTrails.forEach((trail, name) => { if (!activeNames.has(name)) trail.visible = false; });
  };
}
