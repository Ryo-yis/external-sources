// 砂漠エリアのマップ、住民、調査内容、選べる対策をまとめる。
const desertArea = {
  id: "desert",
  name: "陽だまりのオアシス町",
  region: "砂漠のエリア",
  maps: {
    town: {
      name: "陽だまりのオアシス町",
      map: [
        "#####################",
        "#PPPPPPPPPPPPPPPPPPP#",
        "#PssssssTsPsTssssssP#",
        "#PTHHHHffcPcffHHHHTP#",
        "#PsHHHHffsPsffHHHHsP#",
        "#PcHHHHffsPsffHHHHcP#",
        "#PssPssssoPosssPsssP#",
        "#PPPPPPPPPPPPPPPPPPP#",
        "#PssPsssssPssssPsssP#",
        "#PcHHHHTTsPsRRHHHHcP#",
        "#PsHHHHTTsPsRRHHHHsP#",
        "#PTHHHHTTcPcRRHHHHTP#",
        "#PssssssTsPsTssssssP#",
        "#PPPPPPPPPPPPPPPPPPP#",
        "#####################",
      ],
      spawn: { x: 2, y: 2 },
      features: [
        { id: "farmer", kind: "person", name: "農家のサミ", x: 10, y: 4 },
        { id: "fieldGate", kind: "entrance", name: "オアシス周辺のフィールドへ", x: 10, y: 13, icon: "門", destination: "field" },
        { id: "portal", kind: "portal", name: "海辺の町への道", x: 19, y: 7, icon: "⇄" },
      ],
    },
    field: {
      name: "乾いた畑とオアシスのフィールド",
      map: [
        "#####################",
        "#ssssPssssssssssssss#",
        "#sTccPccOOOOscccccss#",
        "#scccPccOOOOccccchTs#",
        "#scccPssOOOOscccchss#",
        "#scccPsTs~shTssPscRs#",
        "#shhsPsss~sshssPscRs#",
        "#PPPPPPPPBPPPPPPPPPP#",
        "#ssssPshs~sssssPscRs#",
        "#ssTsPsshssssccPcsss#",
        "#sRRRPsTssRRTssPssTs#",
        "#ssssPhhsssshssPsshs#",
        "#PPPPPPPPPPPPPPPPPPP#",
        "#PsssPsssssssssPssss#",
        "#####################",
      ],
      spawn: { x: 2, y: 12 },
      features: [
        { id: "well", kind: "clue", name: "井戸の調査", x: 9, y: 5, icon: "?" },
        { id: "field", kind: "clue", name: "畑の調査", x: 16, y: 5, icon: "?" },
        { id: "townGate", kind: "entrance", name: "オアシスの町へ", x: 1, y: 13, icon: "門", destination: "town" },
      ],
    },
  },
  createState() {
    return { talked: false, well: false, field: false, actions: [] };
  },
  getStatus(state) {
    if (state.actions.length === 0) return "水と土の負担は続いている";
    if (state.actions.length === 3) return "町が水と土を大切にする工夫を継続中";
    return `水と土を守る工夫が進行中（${state.actions.length}/3 種類）`;
  },
  getQuest(state) {
    if (!state.well || !state.field) {
      return {
        title: "水と土地の変化を調べよう",
        description: `井戸と畑を調べよう。調査できた場所：${Number(state.well) + Number(state.field)}/2`,
      };
    }
    return {
      title: "町のみんなと水と土地を守ろう",
      description: `調査完了。できる対策を選ぼう：${state.actions.length}/3`,
    };
  },
  interact(id, state) {
    if (id === "farmer") {
      state.talked = true;
      if (!state.well || !state.field) {
        return {
          title: "農家のサミ",
          text: "雨が少ない年が続き、畑の土も弱ってきた気がするんだ。水の使い方や土地の様子を調べて、みんなでできることを探してくれない？",
        };
      }
      if (state.actions.length === 3) {
        return {
          title: "農家のサミ",
          text: "水を大切に使い、土を守る工夫が広がってきたよ。雨の少なさや気候の変化をすぐに変えることはできないけれど、土地に合った方法を続けて、変化を確かめていこう。",
        };
      }
      return {
        title: "農家のサミ",
        text: "調査ありがとう。節水、使った水の再利用、土や植物を守る工夫を、地域に合う形で組み合わせたいね。",
        choices: desertChoices(state),
      };
    }

    if (id === "well") {
      state.well = true;
      return {
        title: "井戸の調査",
        text: "井戸の水位が下がっている。雨が少ない時期や、地下水を補う量を上回るくみ上げが続くと、水不足につながることがある。水の量には限りがあり、地域で使い方を考える必要がある。",
      };
    }

    if (id === "field") {
      state.field = true;
      return {
        title: "畑の調査",
        text: "土の表面が乾き、風で飛ばされやすくなっている場所がある。乾燥や気候の変化に加え、土地に合わない耕作や植生の減少など、人の活動も土地の劣化に関わることがある。砂漠化は、乾燥地の土地が劣化する問題で、砂漠が単純に広がることだけを指すのではない。",
      };
    }

    return null;
  },
  choose(id, state) {
    const choice = desertChoices(state).find((item) => item.id === id);
    if (!choice) return null;
    state.actions.push(id);
    return {
      title: choice.label,
      text: choice.result,
    };
  },
};

function desertChoices(state) {
  const choices = [
    {
      id: "save",
      label: "水漏れを直し、畑に合った節水方法を試す",
      result: "町で水漏れを修理し、畑ごとに必要な水を確かめることにした。無駄を減らせるが、節水だけですべての水不足が解決するわけではない。作物や土地に合う方法を選び、効果を確かめよう。",
    },
    {
      id: "reuse",
      label: "安全を確かめながら、使った水を再利用する",
      result: "手洗いなどで使った水を、用途に合う方法で再利用する計画を始めた。水資源を有効に使えるが、飲み水に戻すには適切な処理が必要で、どんな水でもそのまま使えるわけではない。",
    },
    {
      id: "soil",
      label: "地域に合う植物や覆いで土を守り、植生を回復する",
      result: "畑の土を覆い、土地に合う植物を育てる場所をつくった。土が風で飛ばされるのを抑え、保水を助けることがある。植物の選び方や水の使い方が地域に合っているか、長く見守る必要がある。",
    },
  ];
  return choices.filter((choice) => !state.actions.includes(choice.id));
}
