typedef int DWORD;
typedef int BOOL;
typedef DWORD Void;
typedef DWORD Any;
typedef DWORD Hash;
typedef int Entity;
typedef int Player;
typedef int FireId;
typedef int Ped;
typedef int Vehicle;
typedef int Cam;
typedef int CarGenerator;
typedef int Group;
typedef int Train;
typedef int Pickup;
typedef int Object;
typedef int Weapon;
typedef int Interior;
typedef int Blip;
typedef int Texture;
typedef int TextureDict;
typedef int CoverPoint;
typedef int Camera;
typedef int TaskSequence;
typedef int ColourIndex;
typedef int Sphere;
typedef int ScrHandle;
typedef int ItemSet;
typedef int AnimScene;
typedef int PersChar;
typedef int PopZone;
typedef int Prompt;
typedef int PropSet;
typedef int Volume;

typedef struct
{
	float x;
	DWORD _paddingx;
	float y;
	DWORD _paddingy;
	float z;
	DWORD _paddingz;
} Vector3;

typedef int func;
typedef int object;

#define since(ver) __attribute__((annotate("since:" #ver)))
#define until(ver) __attribute__((annotate("until:" #ver)))
#define cs_type(realType) __attribute__((annotate("cs_type:" #realType)))
#define cs_split __attribute__((annotate("cs_split")))
#define cs_omit __attribute__((annotate("cs_omit")))
